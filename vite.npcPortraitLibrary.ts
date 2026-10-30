import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const VIRTUAL_ID = "virtual:npc-portrait-library";
const RESOLVED_ID = `\0${VIRTUAL_ID}`;
const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const libraryRoot = path.resolve(projectRoot, "..", "..", "素材库", "角色人物立绘");

const emotionFiles = [
  "emotion_angry.png",
  "emotion_disappointed.png",
  "emotion_happy.png",
  "emotion_sad.png",
  "emotion_surprised.png",
] as const;
const expressionFiles = [
  "expression_angry.png",
  "expression_embarrassed.png",
  "expression_smile.png",
  "expression_surprised.png",
] as const;
const actionFiles = [
  "action_arms_crossed.png",
  "action_hands_on_hips.png",
  "action_shrug.png",
  "action_thinking.png",
] as const;
const npcFolders: Readonly<Record<string, string>> = {
  npc_chen_jie: "陈姐立绘",
  npc_suburb_farmer: "陈守田立绘",
  npc_fan_kejie: "范柯杰立绘",
  npc_fan_kexi: "范珂汐立绘",
  npc_jack_fanma: "杰克范马立绘",
  npc_lin_xiaoyu: "林小雨立绘",
  npc_snack_street_vendor: "马师傅立绘",
  npc_flower_market_owner: "苏荷立绘",
  npc_librarian: "图书馆大姐立绘",
  npc_wang_lei: "王爷爷立绘",
  npc_netbar_boss: "网咖老板立绘",
  npc_zhao_gang: "赵刚立绘",
};
const extraEmotions = ["emotion_confident.png", "emotion_embarrassed.png", "emotion_worried.png"] as const;

function libraryPortraits() {
  const files: Array<{ key: string; path: string; name: string }> = [];
  const activeNpcs = new Set<string>(JSON.parse(fs.readFileSync(path.join(projectRoot,'src/game/data/npcs.json'),'utf8')).map((npc:{id:string})=>npc.id));
  const dialogueArt:Record<string,Record<string,{file:string;sha256:string;libraryFile?:string}>> = JSON.parse(
    fs.readFileSync(path.join(projectRoot,'src/game/data/npcDialogueArt.json'),'utf8'),
  );
  const weatherNames:Record<string,string> = {default:'常态',summer:'夏季',rain:'雨天',winter:'冬季'};
  for (const [npcId, folder] of Object.entries(npcFolders)) {
    if(!activeNpcs.has(npcId))continue;
    const names = [
      ...emotionFiles.map((name) => ({ category: "情绪立绘", name })),
      ...expressionFiles.map((name) => ({ category: path.join("情绪立绘", "表情立绘"), name })),
      ...actionFiles.map((name) => ({ category: path.join("情绪立绘", "动作立绘"), name })),
      ...((npcId.startsWith("npc_fan_") || npcId === "npc_jack_fanma")
        ? extraEmotions.map((name) => ({ category: "情绪立绘", name }))
        : []),
    ];
    for (const { category, name } of names) {
      const sourcePath = path.join(libraryRoot, folder, category, name);
      if (!fs.existsSync(sourcePath)) {
        throw new Error(`NPC portrait missing from asset library: ${sourcePath}`);
      }
      files.push({
        key: `/src/assets/portraits/unmasked-clean/${npcId}/${name}`,
        path: sourcePath,
        name: `${npcId}-${name}`,
      });
    }
    for(const [weather,sheet] of Object.entries(dialogueArt[npcId]??{})){
      const sourcePath=path.join(libraryRoot,folder,sheet.libraryFile??path.join('情绪立绘','完整半身对话_20261015',`${weatherNames[weather]}_九种表情.png`));
      if(!fs.existsSync(sourcePath))throw new Error(`NPC complete dialogue portrait missing: ${sourcePath}`);
      const hash=createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex').toUpperCase();
      if(hash!==sheet.sha256)throw new Error(`NPC complete dialogue portrait hash mismatch: ${sourcePath}`);
      files.push({key:`/src/assets/portraits/npc_dialogue/${npcId}/${sheet.file}`,path:sourcePath,name:`${npcId}-dialogue-${weather}.png`});
    }
  }
  return files;
}

export function npcPortraitLibrary(): Plugin {
  const files = libraryPortraits();
  let isBuild = false;

  return {
    name: "urban-life-npc-portrait-library",
    configResolved(config) {
      isBuild = config.command === "build";
    },
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
    },
    load(id) {
      if (id !== RESOLVED_ID) return;
      if (!isBuild) {
        return `export const npcLibraryPortraitSources = ${JSON.stringify(
          Object.fromEntries(files.map(({ key }) => [key, key])),
        )};`;
      }

      const entries = files.map(({ key, path: sourcePath, name }) => {
        const reference = this.emitFile({
          type: "asset",
          name,
          source: fs.readFileSync(sourcePath),
        });
        return `${JSON.stringify(key)}: import.meta.ROLLUP_FILE_URL_${reference}`;
      });
      return `export const npcLibraryPortraitSources = {${entries.join(",")}};`;
    },
    configureServer(server) {
      const byKey = new Map(files.map(({ key, path: sourcePath }) => [key, sourcePath]));
      server.middlewares.use((request, response, next) => {
        let pathname: string;
        try {
          const url=new URL(request.url??'/',"http://vite.local");
          // Vite's asset imports need its JavaScript URL module, not raw PNG bytes.
          if(url.searchParams.has('import')){next();return;}
          pathname = url.pathname;
        } catch {
          next();
          return;
        }
        const sourcePath = byKey.get(pathname);
        if (!sourcePath) {
          next();
          return;
        }
        response.setHeader("Content-Type", "image/png");
        response.setHeader("Cache-Control", "no-cache");
        response.end(fs.readFileSync(sourcePath));
      });
    },
  };
}
