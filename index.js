import express from "express";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
    GameApiHttpError,
    fetchGameApiWithApiCodePost,
    runManagedMiningLoop,
    setApiAutoMining,
} from "./tools.js";

const app = express();
app.use(express.json());

const requestSchema = z.object({
    apiCode: z.string().trim().min(1).optional(),
    cacheKey: z.string().trim().min(1).optional(),
    lang: z
        .enum(["zh_CN", "zh_TW", "en_US", "ja_JP", "ko_KR", "ru_RU"])
        .optional(),
    pollingIntervalMilliseconds: z.number().int().positive().optional(),
    roundIntervalMilliseconds: z.number().int().positive().optional(),
    maxConsecutiveErrorCount: z.number().int().positive().optional(),
    sinceEventId: z.number().int().nonnegative().optional(),
    openclawSessionKey: z.string().trim().min(1).optional(),
    sessionKey: z.string().trim().min(1).optional(),
    forceRestart: z.boolean().optional(),
    autoBuyStamina: z.boolean().optional(),
    autoBuyStaminaMaxFailures: z.number().int().positive().optional(),
});

const apiCodeCache = new Map();
const defaultCacheKey = "default";
const apiCodeStorePath = process.env.API_CODE_STORE_PATH ??
    path.join(process.cwd(), "data", "api-code-store.json");
const defaultManagedMaxConsecutiveErrorCount = Number(process.env.MANAGED_MINING_MAX_CONSECUTIVE_ERROR_COUNT ?? "10");
const maxMiningSessionEventCount = Number(process.env.MINING_SESSION_MAX_EVENTS ?? "200");
const defaultAutoBuyStaminaEnabledFromEnv = process.env.MANAGED_MINING_AUTO_BUY_STAMINA === "1" ||
    process.env.MANAGED_MINING_AUTO_BUY_STAMINA === "true";

let managedMiningTask;
let managedMiningStatus = buildIdleManagedMiningStatus();
let miningSessionEventIdCounter = 0;
let managedMiningTaskGeneration = 0;

async function loadApiCodeStore() {
    try {
        const raw = await readFile(apiCodeStorePath, "utf8");
        const data = JSON.parse(raw);
        if (data && typeof data === "object") {
            for (const [k, v] of Object.entries(data)) {
                if (typeof v === "string" && v.trim()) {
                    apiCodeCache.set(k, v.trim());
                }
            }
        }
    } catch {
        // ignore if store does not exist yet
    }
}

async function persistApiCodeStore() {
    try {
        await mkdir(path.dirname(apiCodeStorePath), { recursive: true });
        const obj = {};
        for (const [k, v] of apiCodeCache.entries()) {
            obj[k] = v;
        }
        const tempPath = `${apiCodeStorePath}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
        await writeFile(tempPath, JSON.stringify(obj, null, 2), "utf8");
        await rename(tempPath, apiCodeStorePath);
    } catch (err) {
        console.error("Failed to persist api code store:", err);
    }
}

async function upsertApiCode(cacheKey, apiCode) {
    if (typeof apiCode === "string" && apiCode.trim()) {
        apiCodeCache.set(cacheKey, apiCode.trim());
        await persistApiCodeStore();
    }
}

function resolveApiCodeOrBadRequest(res, payload, cacheKey) {
    const apiCode = payload.apiCode?.trim() || apiCodeCache.get(cacheKey);
    if (!apiCode) {
        res.status(400).json({ ok: false, error: "api_code_required" });
        return undefined;
    }
    return apiCode;
}

function buildIdleManagedMiningStatus() {
    return {
        running: false,
        state: "idle",
        cacheKey: null,
        startedAt: null,
        stoppedAt: null,
        lastError: null,
        consecutiveErrorCount: 0,
        totalRounds: 0,
        totalSuccessRounds: 0,
        totalFailedRounds: 0,
        lastRoundAt: null,
        lastRoundSuccess: null,
        lastRoundResult: null,
        staminaAutoBoughtCount: 0,
        staminaAutoBuyFailures: 0,
        lastStaminaAutoBuyAt: null,
        lastStaminaAutoBuyResult: null,
        eventCount: 0,
    };
}

app.post("/tool/:name", async (req, res) => {
    const parsed = requestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
        return res.status(400).json({ ok: false, error: "invalid_payload" });
    }
    const toolName = req.params.name;
    const payload = parsed.data;
    const cacheKey = payload.cacheKey ?? defaultCacheKey;

    try {
        if (toolName === "set_api_code") {
            if (!payload.apiCode) {
                return res.status(400).json({ ok: false, error: "api_code_required" });
            }
            apiCodeCache.set(cacheKey, payload.apiCode);
            await persistApiCodeStore();
            return res.json({ ok: true, data: { cacheKey, hasApiCode: true } });
        }
        if (toolName === "get_api_code") {
            const cachedApiCode = apiCodeCache.get(cacheKey);
            if (!cachedApiCode) {
                return res.status(404).json({ ok: false, error: "api_code_not_found" });
            }
            return res.json({ ok: true, data: { cacheKey, apiCode: cachedApiCode } });
        }
        if (toolName === "clear_api_code") {
            const deleted = apiCodeCache.delete(cacheKey);
            if (deleted) {
                await persistApiCodeStore();
            }
            return res.json({ ok: true, data: { cacheKey, deleted } });
        }
        if (toolName === "check_mining_state") {
            if (payload.apiCode) {
                await upsertApiCode(cacheKey, payload.apiCode);
            }
            const apiCode = resolveApiCodeOrBadRequest(res, payload, cacheKey);
            if (apiCode === undefined) {
                return;
            }
            const upstream = await fetchGameApiWithApiCodePost("/api/checkMiningState", apiCode, {});
            return res.status(upstream.httpStatus).json(upstream.body);
        }
        if (toolName === "buy_stamina") {
            if (payload.apiCode) {
                await upsertApiCode(cacheKey, payload.apiCode);
            }
            const apiCode = resolveApiCodeOrBadRequest(res, payload, cacheKey);
            if (apiCode === undefined) {
                return;
            }
            const upstream = await fetchGameApiWithApiCodePost("/api/buyStamina", apiCode, {});
            return res.status(upstream.httpStatus).json(upstream.body);
        }
        if (toolName === "get_stamina") {
            if (payload.apiCode) {
                await upsertApiCode(cacheKey, payload.apiCode);
            }
            const apiCode = resolveApiCodeOrBadRequest(res, payload, cacheKey);
            if (apiCode === undefined) {
                return;
            }
            const upstream = await fetchGameApiWithApiCodePost("/api/getStamina", apiCode, {});
            return res.status(upstream.httpStatus).json(upstream.body);
        }
        return res.status(404).json({ ok: false, error: "unknown_tool" });
    } catch (err) {
        if (err instanceof GameApiHttpError) {
            return res.status(err.httpStatus).json(err.body);
        }
        return res.status(500).json({ ok: false, error: err.message });
    }
});

// Маршрут для обновления кода танка "Демон"
app.get("/upload-tank", async (req, res) => {
    try {
        const tankCode = `function onTick(ctx) {
          const { me, enemy, game } = ctx;
          if (!enemy.tank) {
            if (game.star) {
              const starX = game.star[0], starY = game.star[1], myX = me.tank.position[0], myY = me.tank.position[1];
              if (myX < starX) me.turn("right");
              else if (myX > starX) me.turn("left");
              else if (myY < starY) me.turn("down");
              else if (myY > starY) me.turn("up");
              me.go();
            }
            return;
          }
          const enemyX = enemy.tank.position[0], enemyY = enemy.tank.position[1], myX = me.tank.position[0], myY = me.tank.position[1];
          if (!me.status.fireLocked) {
            if (myX === enemyX) {
              if (myY > enemyY && me.tank.direction !== "up") me.turn("up");
              else if (myY < enemyY && me.tank.direction !== "down") me.turn("down");
              else me.fire();
            } else if (myY === enemyY) {
              if (myX > enemyX && me.tank.direction !== "left") me.turn("left");
              else if (myX < enemyX && me.tank.direction !== "right") me.turn("right");
              else me.fire();
            }
          }
          if (me.skill && me.skill.remainingCooldownFrames === 0) {
            if (me.skill.type === "shield" && !me.status.shielded) me.shield();
            else if (me.skill.type === "boost" && !me.status.boosted) me.boost();
            else if (me.skill.type === "overload") me.overload();
          }
          if (myX < enemyX) {
            if (me.tank.direction !== "right") me.turn("right");
            else me.go();
          } else {
            if (me.tank.direction !== "left") me.turn("left");
            else me.go();
          }
        }`;

        const response = await fetch("https://apitk.clawquest.net/tank/api/agent/code/upload", {
            method: "POST",
            headers: {
                "Authorization": "Bearer agtk_UtpmYltGtKKBcLFi4Ptf1T4g",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ code: tankCode })
        });

        const data = await response.json();
        res.json({ ok: true, result: data });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
loadApiCodeStore().then(() => {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
});
