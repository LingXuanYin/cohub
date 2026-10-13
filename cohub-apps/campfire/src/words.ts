export type WordEntry = { word: string; hint: string };

export const WORD_BANK: Record<"en" | "zh", WordEntry[]> = {
  en: [
    { word: "lighthouse", hint: "place" }, { word: "campfire", hint: "thing" }, { word: "kettle", hint: "object" },
    { word: "whale", hint: "animal" }, { word: "cactus", hint: "plant" }, { word: "bicycle", hint: "vehicle" },
    { word: "umbrella", hint: "object" }, { word: "penguin", hint: "animal" }, { word: "windmill", hint: "place" },
    { word: "guitar", hint: "object" }, { word: "rocket", hint: "vehicle" }, { word: "castle", hint: "place" },
    { word: "sunflower", hint: "plant" }, { word: "octopus", hint: "animal" }, { word: "telescope", hint: "object" },
    { word: "hot air balloon", hint: "vehicle" }, { word: "mushroom", hint: "plant" }, { word: "snowman", hint: "figure" },
    { word: "teapot", hint: "object" }, { word: "dragonfly", hint: "animal" }, { word: "submarine", hint: "vehicle" },
    { word: "hourglass", hint: "object" }, { word: "volcano", hint: "place" }, { word: "hammock", hint: "object" },
    { word: "astronaut", hint: "person" }, { word: "bridge", hint: "place" }, { word: "fan", hint: "object" },
    { word: "sea turtle", hint: "animal" }, { word: "traffic light", hint: "object" }, { word: "harp", hint: "object" },
    { word: "birdhouse", hint: "object" }, { word: "mountain", hint: "place" }, { word: "kite", hint: "object" },
    { word: "jellyfish", hint: "animal" }, { word: "lantern", hint: "object" }, { word: "tractor", hint: "vehicle" },
    { word: "waterfall", hint: "place" }, { word: "violin", hint: "object" },
    { word: "hedgehog", hint: "animal" }, { word: "ladder", hint: "object" }, { word: "sailboat", hint: "vehicle" },
    { word: "camping tent", hint: "object" }, { word: "owl", hint: "animal" }, { word: "paint palette", hint: "object" },
    { word: "beach ball", hint: "object" }, { word: "crab", hint: "animal" },
    { word: "treasure chest", hint: "object" }, { word: "robot", hint: "figure" }, { word: "fountain", hint: "place" },
    { word: "bamboo", hint: "plant" }, { word: "compass", hint: "object" }, { word: "pretzel", hint: "food" },
    { word: "seahorse", hint: "animal" }, { word: "candle", hint: "object" }, { word: "canoe", hint: "vehicle" },
    { word: "squirrel", hint: "animal" }, { word: "wristwatch", hint: "object" }, { word: "rainbow", hint: "sky" },
    { word: "porcupine", hint: "animal" }, { word: "spider web", hint: "object" }, { word: "ice cream", hint: "food" },
  ],
  zh: [
    { word: "篝火", hint: "物品" }, { word: "灯塔", hint: "地点" }, { word: "水壶", hint: "物品" },
    { word: "鲸鱼", hint: "动物" }, { word: "仙人掌", hint: "植物" }, { word: "自行车", hint: "交通工具" },
    { word: "雨伞", hint: "物品" }, { word: "企鹅", hint: "动物" }, { word: "风车", hint: "地点" },
    { word: "吉他", hint: "物品" }, { word: "火箭", hint: "交通工具" }, { word: "城堡", hint: "地点" },
    { word: "向日葵", hint: "植物" }, { word: "章鱼", hint: "动物" }, { word: "望远镜", hint: "物品" },
    { word: "热气球", hint: "交通工具" }, { word: "蘑菇", hint: "植物" }, { word: "雪人", hint: "形象" },
    { word: "茶壶", hint: "物品" }, { word: "蜻蜓", hint: "动物" }, { word: "潜水艇", hint: "交通工具" },
    { word: "沙漏", hint: "物品" }, { word: "火山", hint: "地点" }, { word: "吊床", hint: "物品" },
    { word: "宇航员", hint: "人物" }, { word: "桥", hint: "地点" }, { word: "扇子", hint: "物品" },
    { word: "海龟", hint: "动物" }, { word: "红绿灯", hint: "物品" }, { word: "竖琴", hint: "物品" },
    { word: "鸟屋", hint: "物品" }, { word: "山峰", hint: "地点" }, { word: "风筝", hint: "物品" },
    { word: "水母", hint: "动物" }, { word: "灯笼", hint: "物品" }, { word: "拖拉机", hint: "交通工具" },
    { word: "瀑布", hint: "地点" }, { word: "小提琴", hint: "物品" }, { word: "刺猬", hint: "动物" },
    { word: "梯子", hint: "物品" }, { word: "帆船", hint: "交通工具" }, { word: "帐篷", hint: "物品" },
    { word: "猫头鹰", hint: "动物" }, { word: "调色板", hint: "物品" }, { word: "皮球", hint: "物品" },
    { word: "螃蟹", hint: "动物" }, { word: "宝箱", hint: "物品" }, { word: "机器人", hint: "形象" },
    { word: "喷泉", hint: "地点" }, { word: "竹子", hint: "植物" }, { word: "指南针", hint: "物品" },
    { word: "椒盐卷饼", hint: "食物" }, { word: "海马", hint: "动物" }, { word: "蜡烛", hint: "物品" },
    { word: "独木舟", hint: "交通工具" }, { word: "松鼠", hint: "动物" }, { word: "手表", hint: "物品" },
    { word: "彩虹", hint: "天空" }, { word: "蜘蛛网", hint: "物品" }, { word: "冰淇淋", hint: "食物" },
  ],
};

export type Locale = keyof typeof WORD_BANK;

export const offerWords = (locale: Locale, used: string[], count = 3, random = Math.random): WordEntry[] => {
  const fresh = WORD_BANK[locale].filter((entry) => !used.includes(entry.word));
  const pool = [...(fresh.length >= count ? fresh : WORD_BANK[locale])];
  for (let index = 0; index < count && index < pool.length; index += 1) {
    const pick = index + Math.floor(random() * (pool.length - index));
    [pool[index], pool[pick]] = [pool[pick] as WordEntry, pool[index] as WordEntry];
  }
  return pool.slice(0, count);
};
