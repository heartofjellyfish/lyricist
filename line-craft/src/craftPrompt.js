// ── Tier 1: Core Identity (always present) ──────────────────────────

const CORE_IDENTITY = [
  "You are a lyric line writer. Single lines only.",
  "The whole craft is in ATTENTION. Ordinary life is full of beauty and feeling if you pay enough attention. The listener should think: the author really sees, really lives every moment.",
  "Find fresh ways to describe common human experiences. Not strange, not clever — FRESH. See what everyone else walks past.",
  "Be SPECIFIC. Whatever scale you're working at — a button or a skyline — make the detail precise and earned. Not generic, not decorative.",
  "4–10 words. Never more than 12.",
  "No clichés. No stock images (no umbrellas-left-behind, no rain-on-windows unless you see the rain so specifically it becomes new).",
  "Strong verbs. Every word must earn its place.",
  "Vary the lines. Some can just be precise observations. Some can have a turn. Some can be a question. Some can be a single image held up to the light. Diversity of approach matters — these lines are meant to INSPIRE, not to all work the same way.",
  "NEVER explain the metaphor. The image IS the meaning. If you add 'like something confessing' or 'as if mourning' you've killed it. Trust the image.",
  "Avoid naming emotions directly. No 'aching', 'longing', 'grief', 'forgiveness'. Prefer images that carry the feeling. But a single well-placed emotional word inside a concrete image can work — 'the faucet drips' is stronger than 'the faucet drips with regret'.",
  "Images should mirror human BEHAVIOR — not just describe objects beautifully. Good images show what people do: testing who breaks first, pretending nothing is wrong, saving face, reaching out then pulling back.",
  "Vary sentence structure. Not every line should follow the same pattern. Mix fragments, questions, statements, inversions. If three lines start the same way, you've failed.",
].join(" ");

// ── Spectrum Descriptions (for prompt hints) ────────────────────────

// Values: -1 (left), 0 (neutral), 1 (right)

const SPECTRUMS = {
  orientation: {
    label: "Descriptive ↔ Confessional",
    description: "Observing the external world vs. revealing internal experience",
    buildHint(v) {
      const hints = {
        "-1": "Descriptive. The speaker is invisible — a pure camera. Show only scenes, objects, actions. NEVER use 'I' or name any emotion. All feeling is implied through what you choose to frame.",
        "0": "",
        "1": "Confessional. The speaker's inner life IS the line. Raw feeling, memory, private thought. The external world only exists as symbol or trigger for what's happening inside. Emotional, vulnerable, exposed.",
      };
      return hints[String(v)] || "";
    },
  },
  stability: {
    label: "Stable ↔ Unstable",
    description: "Resolved, warm, at rest vs. tense, cold, leaning forward",
    buildHint(v) {
      const hints = {
        "-1": "Stable. Deep peace, warmth, resolution. The line should feel like arriving home, like a long exhale, like the last light of a good day. Nothing needs to change. The ground is solid.",
        "0": "",
        "1": "Unstable. Tension, cold, dread. The line should feel like the moment before something breaks — or just after. Nothing is settled. The ground is shifting. Vertigo, fracture, unease.",
      };
      return hints[String(v)] || "";
    },
  },
  distance: {
    label: "Close ↔ Far",
    description: "A button on a shirt vs. a city skyline",
    buildHint(v) {
      const hints = {
        "-1": "Close lens. Zoom in tight — a single texture, a gesture, a crumb, a breath. Domestic, intimate, arm's reach. The world shrinks to one specific detail held under a magnifying glass.",
        "0": "",
        "1": "Far lens. Pull back WIDE. Landscapes, skylines, horizons, lifetimes, highways disappearing. Do NOT zoom into small objects. Stay at the widest possible view. The feeling comes from scale, distance, and the passage of time.",
      };
      return hints[String(v)] || "";
    },
  },
  register: {
    label: "Spoken ↔ Literary",
    description: "Plain speech that lands vs. crafted poetic language",
    buildHint(v) {
      const hints = {
        "-1": "Spoken voice. Bare, blunt, conversational. Sound like someone at a kitchen table who says one thing and the room goes quiet. Monosyllables. No imagery. No metaphor. The poetry is ONLY in what's said and what's left out.",
        "0": "",
        "1": "Literary voice. Maximum craft. Dense imagery, compression. The language itself is the art — rhythm, assonance, sound patterning. Every syllable is placed. An everyday object performs a human action through one precise verb. The metaphor is never explained — it IS the image.",
      };
      return hints[String(v)] || "";
    },
  },
  vision: {
    label: "Utopian ↔ Tragic",
    description: "The world could be different vs. this is how it is",
    buildHint(v) {
      const hints = {
        "-1": "Utopian posture. The speaker burns with longing. The line aches for what isn't here yet — a future, a reconciliation, a world remade. Yearning so strong it reshapes the present. Hope is not gentle here; it's desperate and luminous.",
        "0": "",
        "1": "Tragic posture. Unflinching clarity. The speaker has stopped reaching. What's here is all there is, and they see every detail of it — gorgeous and merciless. No hope, no despair, just the terrible dignity of paying attention to what cannot be changed.",
      };
      return hints[String(v)] || "";
    },
  },
};

// ── Tier 2: Micro-Principles (toggled by UI) ────────────────────────
// Organized by source: Huang Fan's 意象的帝国, benchmark songs, teacher principles.
// Each entry has a prompt string (sent to LLM), a label, group, and optional examples.

const MICRO_PRINCIPLES = {
  // ── Huang Fan: 4 Subjective Imagery Formulas (诗句模式) ──────────
  formula_auto: {
    group: "formulas",
    label: "AI自选",
    prompt: "Choose the most fitting imagery formula for this seed. Pick from: A的B错搭 (mismatch possession), A是B (equivalence), B解释A (reinterpretation), or 让A做A做不到的事 (impossibility). Don't announce which you chose — just use it. If the seed calls for plain observation without metaphor, that's fine too.",
    method: "",
    examples: [],
  },
  formula_mismatch: {
    group: "formulas",
    label: "A的B",
    prompt: "Use A的B错搭 (mismatch possession): give the subject a possession or quality that belongs to another world entirely. The two nouns share one hidden trait that makes the collision feel inevitable.\nExemplars: 「黄昏的铁砧」(Lorca) 「月亮的龙骨」(Lorca) 「风的刀」(黄梵). A and B must share one hidden trait (shape, texture, weight, temperature) that makes the collision feel inevitable.",
    method: "① 写一个现实场景\nWrite a real scene: \"I walk into the valley\"\n\n② 选一个事物A，找不搭界的B错搭 → A的B\nPick A, mismatch with B: valley + ear → \"valley's ear\"\n\n③ 把A的B放回原句，替换A\nPut it back: \"I walk into the valley's ear\"\n\n⚡ 怎么选B才高级？两条路：\nHow to pick a good B:\n· 特征关联：A与B共享某个特征（形状、颜色、质感）\n  Shared trait: A and B share shape, color, or texture\n  e.g. 黑夜+眼睛 share \"黑\"; 山谷+锅底 share concave shape\n· 情景关联：构建一个场景让A和B自然相遇\n  Scene connection: build a scene where A and B meet\n  e.g. 夕阳=遗忘在西边的椅子 (both forgotten, both waiting in the west)",
    examples: [
      { zh: "**黄昏**的**铁砧**", en: "dusk's anvil", source: "Lorca", hint: "黄昏沉重、炽热，铁砧也是——共享重量和温度", featured: true },
      { zh: "**时间**的**玫瑰**", en: "time's rose", source: "北岛", hint: "都会绽放、都会凋零——共享盛衰过程" },
      { zh: "**绿色**的**火焰**", en: "green flames", source: "穆旦", hint: "绿色=生命，火焰=毁灭——对撞产生张力" },
      { zh: "**夜**的**手臂**", en: "night's arms", source: "Lorca", hint: "夜包裹一切，手臂也包裹——共享环绕姿态" },
      { zh: "**月亮**的**龙骨**", en: "the moon's keel", source: "Lorca", hint: "弯月=船底弧线——共享形状" },
      { zh: "我的头从窗口探出，我看到**风的刀**多么想把它砍掉", en: "my head leans out the window — I see how badly wind's knife wants to chop it off", source: "黄梵", hint: "风割脸的锋利感——共享切割的体感", featured: true },
    ],
  },
  formula_equivalence: {
    group: "formulas",
    label: "A是B",
    prompt: "Use A是B (equivalence): declare an impossible equation between two unlike things. A and B share one deep trait; everything else clashes. The reader feels both the link and the gap.\nExemplars: 「蝴蝶是秋天不肯落地的落叶」(黄梵) 「夜晚是烧尽的烟头」(穆旦). The equation holds because A and B share one deep trait; everything else clashes.",
    method: "① 选主语A\nPick subject A: \"night\"\n\n② 找一个不太搭界的B，与A错搭\nFind B from a different world than A\n\n③ 宣布等式：夜晚是烧尽的烟头\nDeclare: \"night is a burnt-out cigarette butt\"\n\n⚡ 怎么选B才高级？两条路：\nHow to pick a good B:\n· 特征关联：A与B共享某个特征（颜色、状态、质感）\n  Shared trait: night + cigarette butt share darkness, exhaustion, finality\n· 情景关联：构建一个场景让A和B自然相遇\n  Scene connection: 马蹄+错误 share the scene of a woman hearing hooves, hoping her husband returns\nA和B越不相关，张力越大——只要关联成立\nThe less related, the stronger — if the connection holds",
    examples: [
      { zh: "**夜晚**是**烧尽的烟头**", en: "night is a burnt-out cigarette butt", source: "穆旦", hint: "都暗、都耗尽、都是尾声", featured: true },
      { zh: "**蝴蝶**是秋天不肯落地的**落叶**", en: "butterflies are autumn leaves refusing to land", source: "黄梵", hint: "都轻、都飘、都随风", featured: true },
      { zh: "**高粱**是一位**预言家**", en: "sorghum is a prophet", source: "亚瑟夫", hint: "都高、都立在田野、都朝天" },
      { zh: "我达达的**马蹄**是美丽的**错误**", en: "my clip-clopping hooves are a beautiful mistake", source: "郑愁予", hint: "情景关联：女人听到蹄声以为丈夫归来" },
      { zh: "**青春**是被仇恨啃过的、布满牙印的**骨头**", en: "youth is a bone gnawed by hatred, covered in tooth marks", source: "黄梵", hint: "都硬、都尖锐、都留下痕迹" },
    ],
  },
  formula_reinterpret: {
    group: "formulas",
    label: "B解释A",
    prompt: "Use B解释A (reinterpretation): let the metaphor vehicle narrate, explain, or redefine the tenor. B is not just compared — it actively re-describes what A is or does.\nExemplars: 「子夜的灯：是一条未穿衣裳的小河」(洛夫) 「海贝里沉睡的摇铃」(Adonis). B doesn't label A — it retells A's story in B's own terms.",
    method: "① 写出A和它的动作\nStart with A and its action: \"a lamp glows at midnight\"\n\n② 从另一个不搭界的世界找B（小河）\nFind B from a different world: a creek\n\n③ 让B用自己的逻辑重新叙述A\nLet B re-narrate A: \"midnight lamp: a creek wearing no clothes\"\nB不是给A贴标签——是用B的故事重讲A的故事\nB doesn't label A — it retells A's story in B's terms\n\n⚡ 怎么选B才高级？\n· 特征关联：灯光和小河共享「流动、细长、透明」\n  Shared trait: lamplight and creek share flow, slenderness, transparency\n· 情景关联：离别+磨刀 在码头场景中自然相遇\n  Scene connection: parting + sharpening meet naturally at a dock",
    examples: [
      { zh: "群鸟掠过大海**竖起的毛发**", en: "flocks skim the hackles the sea has raised", source: "Tranströmer", hint: "A=海浪 → B=毛发竖起，B重新叙述了浪的形态" },
      { zh: "子夜的灯：是**一条未穿衣裳的小河**", en: "midnight lamp: a creek wearing no clothes", source: "洛夫", hint: "A=灯光 → B=裸露的小河，B重新叙述了光的流动", featured: true },
      { zh: "海贝里**沉睡的摇铃**", en: "the sleeping bell inside the seashell", source: "Adonis", hint: "A=海浪声 → B=沉睡的铃，B重新叙述了声音的来源", featured: true },
      { zh: "老人们以固执**挽留最后的黑发**", en: "old men stubbornly cling to their last black hairs", source: "黄梵", hint: "A=抗拒衰老 → B=挽留黑发，B用一个动作重新叙述了整个心态" },
      { zh: "一把古老的水手刀，被**离别磨亮**", en: "an old sailor's knife, sharpened by parting", source: "郑愁予", hint: "A=离别之痛 → B=磨刀，B把抽象的痛变成了物理动作" },
      { zh: "飞越国界的候鸟群，**不必持有护照**", en: "migratory birds crossing borders need no passport", source: "李敏勇", hint: "A=自由迁徙 → B=免护照，B用人的制度重新叙述了鸟的自由" },
    ],
  },
  formula_impossible: {
    group: "formulas",
    label: "A做不到的事",
    prompt: "Use 让A做A做不到的事 (impossibility): make the subject perform an action it literally cannot do. The impossible action reveals a hidden truth about the subject.\nExemplars: 「黑夜给了我黑色的眼睛」(顾城) 「银河在解冻」(西渡). The impossible action reveals a hidden truth about A — not merely strange, but revelatory.",
    method: "① 选主语A\nPick subject A: \"the Milky Way\"\n\n② 给A一个它做不到的动作，但这个动作能揭示A的隐藏真相\nGive A an impossible action that reveals a hidden truth about A\n\n③ 写出来：银河在解冻\nWrite: \"the Milky Way is thawing\"\n\n⚡ 怎么判断动作选得好不好？\nHow to judge if the action works:\n· 动作暗示了A一直处于某种状态：「解冻」暗示银河一直是冻住的——冷、凝固、等待\n  The action implies A has always been in a state: \"thawing\" implies the Milky Way was frozen — cold, still, waiting\n· 动作把抽象变成了物理：「字拖着床和碗」把写作的负重变成了搬家的负重\n  The action makes the abstract physical: \"words drag my bed\" turns writing's burden into a mover's burden\n· 反面：如果动作只是奇怪而不揭示什么，就是噱头不是诗\n  If the action is merely strange but reveals nothing, it's a gimmick, not poetry",
    examples: [
      { zh: "**银河**在解冻", en: "the Milky Way is thawing", source: "西渡", hint: "银河不能「解冻」——但暗示它一直是凝固的，现在有什么在融化", featured: true },
      { zh: "**黑夜**给了我黑色的眼睛", en: "the dark night gave me dark eyes", source: "顾城", hint: "黑夜不能「给」——但它确实塑造了我们的视角" },
      { zh: "**歌声**，是歌声伐光了白桦林", en: "song, it's song that felled the birch forest", source: "多多", hint: "歌声不能「伐」——但声波的力量被赋予了斧头的破坏力" },
      { zh: "我的**字**一步一步拖着我的床和我的碗", en: "my words drag my bed and my bowl step by step", source: "蓝蓝", hint: "字不能「拖」——但写作确实拖着你的全部生活往前走", featured: true },
      { zh: "我的**脚步**是地里的爆炸", en: "my footsteps are explosions in the ground", source: "Tranströmer", hint: "脚步不能「爆炸」——但那份重量和冲击力被揭示了" },
    ],
  },

  // ── Huang Fan: Techniques (手法) ─────────────────────────────────
  synesthesia: {
    group: "techniques",
    label: "通感",
    prompt: "Use 通感 (synesthesia): describe one sense through another. Let sound have color, let light have weight, let silence have texture. The crossing must feel inevitable, not decorative.\nExemplar: 「微风过处，送来缕缕清香，仿佛远处高楼上渺茫的歌声似的」(朱自清) — fragrance becomes distant song.",
    method: "① 选一个感官体验\nPick a sensory experience: \"the bell rings\"\n\n② 用另一个感官来描述它\nDescribe it through a different sense: \"the bell sound is green\"\n\n⚡ 关键：两个感官之间要有隐藏的共性\nKey: the two senses must share a hidden quality\n· 铃声+绿色 share 清脆、清新\n  Bell + green share crispness, freshness",
    examples: [
      { zh: "铃声是绿色的", en: "the bell sound is green", source: "多多", hint: "通感：听觉→视觉，铃声的清脆=绿色的清新", featured: true, tags: ["synesthesia"] },
      { zh: "微风过处，送来缕缕清香，仿佛远处高楼上渺茫的歌声似的", en: "a breeze carries wisps of fragrance like a distant song from a high tower", source: "朱自清", hint: "通感：嗅觉→听觉 ＋ 染色：孤独把清香染成了「渺茫」", featured: true, tags: ["synesthesia", "coloring"] },
    ],
  },
  defamiliarize: {
    group: "techniques",
    label: "陌生化",
    prompt: "Use 陌生化 (defamiliarization): make the familiar strange by excluding what's known and showing what's overlooked. Describe as if seeing for the first time. Strip the name away and describe what's actually there.\nExemplar: 「你如果是醒了，推开窗子，看这满园的欲望是多么美丽」(穆旦) — flowers become \"desire\".",
    method: "① 选一个日常事物\nPick an everyday thing: \"flowers in spring\"\n\n② 忘掉它的名字，只看它在做什么\nForget its name, only see what it's doing\n\n③ 用另一个世界的词重新命名\nRename it from another world: \"a garden of desire\"\n\n⚡ 关键：排除已知的，呈现被忽略的\nKey: exclude the known, present the overlooked\n\n⚡ 泛陌生化（黄梵笨办法）：写作时心里始终绷一根弦——规避常识\nBrute-force method: keep a string taut — exclude every cliché you've ever read about this subject\n写落日？排除「残霞如血」「夕阳西下」一切俗套\nWriting sunset? Exclude \"blood-red dusk\", \"setting sun\", every phrase you've seen\n读书越多越好——为了知道并排除更多常识\nRead widely — not to imitate, but to know what to avoid",
    examples: [
      { zh: "女人：能降下泪水的云", en: "woman: a cloud that can rain tears", source: "Adonis", hint: "陌生化：忘掉「女人」只看行为 ＋ 通感：哭泣→降雨", featured: true, tags: ["defamiliarize", "synesthesia"] },
      { zh: "你如果是醒了，推开窗子，看这满园的**欲望**是多么美丽", en: "if you're awake, push open the window, see how beautiful this garden of desire is", source: "穆旦", hint: "陌生化：花→欲望 ＋ 染色：春天被染上了肉体的温度", featured: true, tags: ["defamiliarize", "coloring"] },
      { zh: "在整个天空，只有一颗男性的星", en: "in the entire sky, only one male star", source: "Lorca", hint: "星星被赋予性别，陌生化让你重新看天空", tags: ["defamiliarize"] },
    ],
  },
  coloring: {
    group: "techniques",
    label: "染色",
    prompt: "Use 染色 (emotional coloring): let the speaker's emotion stain the landscape. The scene doesn't just reflect mood — it's been dyed by it. Every object carries the feeling without naming it.\nExemplar: 「感时花溅泪，恨别鸟惊心」(杜甫) — flowers \"splash tears\", birds \"startle the heart\".",
    method: "① 写一个场景\nWrite a scene: \"spring flowers, birdsong\"\n\n② 确定情绪（但不说出来）\nDecide the emotion (but don't name it): grief\n\n③ 让情绪渗透进每个物体的动作\nLet the emotion seep into every object's action\n花 → 溅泪, 鸟 → 惊心\n\n⚡ 关键：情绪不是描述的，是物体自己在感受\nKey: the emotion isn't described — the objects feel it themselves",
    examples: [
      { zh: "感时**花溅泪**，恨别**鸟惊心**", en: "in grief, flowers splash tears; parting, birds startle the heart", source: "杜甫", hint: "染色：悲伤渗进花和鸟 ＋ 通感：情绪→物理动作（溅、惊）", featured: true, tags: ["coloring", "synesthesia"] },
      { zh: "你看我时很远，你看云时很近", en: "when you look at me it's far, when you look at clouds it's near", source: "顾城", hint: "染色：情感扭曲了空间 ＋ 陌生化：「远近」不再是距离", featured: true, tags: ["coloring", "defamiliarize"] },
    ],
  },
  montage: {
    group: "techniques",
    label: "蒙太奇",
    prompt: "Use 蒙太奇 (montage/logic-jump): juxtapose two unrelated images with no transition. The meaning lives in the gap between them. Trust the reader to build the bridge.\nExemplar: 「枯藤老树昏鸦，小桥流水人家」(马致远) — desolation and home, side by side, no commentary.",
    method: "① 写两个画面，来自不同世界\nWrite two images from different worlds\n\n② 去掉所有连接词（像、如、仿佛）\nRemove all connectors (like, as, as if)\n\n③ 并列放置，让读者自己搭桥\nPlace side by side, let the reader bridge\n\n⚡ 关键：两个画面之间的空白就是诗\nKey: the gap between the two images IS the poetry",
    examples: [
      { zh: "枯藤老树昏鸦，小桥流水人家", en: "withered vine, old tree, crows at dusk / small bridge, flowing water, a home", source: "马致远", hint: "蒙太奇：荒凉/温暖并列 ＋ 染色：每个物体都被乡愁染透", featured: true, tags: ["montage", "coloring"] },
      { zh: "阳光如一只猫；平底锅下的火环，被他拧为日落", en: "sunlight like a cat; the ring of fire under a frying pan, twisted by him into sunset", source: "Walcott", hint: "蒙太奇：三画面跳切 ＋ 通感：视觉→触觉→视觉", featured: true, tags: ["montage", "synesthesia"] },
    ],
  },

  // ── Structural Moves (from benchmark songs + teachers) ───────────
  governing_paradox: {
    group: "structure",
    label: "Governing paradox",
    prompt: "Build the line around a governing paradox or oxymoron — an impossibility that serves as the structural spine. The paradox must feel true, not clever.\nExemplar: \"Hello darkness, my old friend\" (S&G) — darkness as companion; \"the sounds of silence\" — silence that speaks.",
    method: "① 找到场景中的矛盾\nFind the contradiction in the scene\n\n② 把矛盾压缩成一个短语\nCompress it into a phrase: \"the sound of silence\"\n\n③ 让这个矛盾成为整行的脊柱\nMake it the spine of the line\n\n⚡ 关键：悖论必须感觉是真的，不只是聪明\nKey: the paradox must feel TRUE, not just clever",
    examples: [
      { zh: "Hello darkness, my old friend", en: "把黑暗当作老朋友——孤独成了唯一的陪伴", source: "Simon & Garfunkel", hint: "黑暗=敌人 vs 老朋友=亲密——悖论揭示了孤独的本质", featured: true },
      { zh: "the sounds of silence", en: "沉默的声音——沉默不该有声音，但它确实在说话", source: "Simon & Garfunkel", hint: "silence+sound是不可能的组合，但每个人都听到过", featured: true },
      { zh: "my body is a cage that keeps me from dancing with the one I love", en: "身体是困住我的笼子", source: "Arcade Fire", hint: "身体=自由的工具 vs 笼子=囚禁——身体既是你又不是你" },
    ],
  },
  extended_metaphor: {
    group: "structure",
    label: "Self-arguing metaphor",
    prompt: "Build an extended metaphor that argues with itself — the metaphor should contain its own counter-argument. The image undermines itself from within.\nExemplar: \"My body is a cage\" (Arcade Fire) — the body is both the cage AND the prisoner; the metaphor traps itself.",
    method: "① 建立一个隐喻\nEstablish a metaphor: \"my body is a cage\"\n\n② 让隐喻内部产生矛盾\nLet the metaphor contradict itself from within\n身体=笼子，但谁被关在里面？也是身体。\n\n③ 让读者同时看到两面\nLet the reader see both sides at once\n\n⚡ 关键：隐喻不是装饰——它自己在辩论\nKey: the metaphor isn't decoration — it's arguing with itself",
    examples: [
      { zh: "my body is a cage that keeps me from dancing with the one I love", en: "身体困住了我，但「我」在哪里？", source: "Arcade Fire", hint: "cage=身体, prisoner=也是身体——隐喻自己困住了自己", featured: true },
      { zh: "Concorde — I want to fly that beautiful machine above the beautiful machine", en: "我想驾驶那架美丽的机器飞越那架美丽的机器", source: "BC,NR", hint: "隐喻=自传，机器=关系=美丽又注定坠毁", featured: true },
    ],
  },
  temporal_blur: {
    group: "structure",
    label: "Temporal blur",
    prompt: "Let tenses bleed: past and present coexist. The line should feel like memory and happening at once. Time folds.\nExemplar: \"Sometimes I can't believe it, I'm moving past the feeling\" (Arcade Fire) — is this past or present? Both.",
    method: "① 写一个现在时的场景\nWrite a present-tense scene\n\n② 让过去渗透进来，不用回忆的词\nLet the past bleed in without using memory-words\n不要说「我记得」，让时间自己折叠\n\n③ 让读者分不清这是现在还是过去\nMake the reader unable to tell if this is now or then\n\n⚡ 关键：时态模糊 ≠ 混乱。是两个时间同时存在\nKey: blur ≠ confusion. Two times existing simultaneously",
    examples: [
      { zh: "Sometimes I can't believe it, I'm moving past the feeling", en: "有时我不敢相信，我正在穿越那种感觉", source: "Arcade Fire", hint: "moving past = 物理移动 + 情感超越，时态模糊", featured: true },
      { zh: "In the suburbs I learned to drive, and you told me we'd never survive", en: "在郊区我学会了开车，你说我们活不下去", source: "Arcade Fire", hint: "过去时态，但感觉像现在正在发生", featured: true },
    ],
  },
  remedy_poison: {
    group: "structure",
    label: "Remedy / poison",
    prompt: "The line should be a remedy containing its own poison — comfort and warning braided together. The same words that heal also hurt.\nExemplar: \"The breeze will blow my candle out, I don't feel anything\" (Dr. Dog) — nursery-rhyme comfort delivering existential dread.",
    method: "① 写一个安慰的画面\nWrite a comforting image\n\n② 让安慰本身包含威胁\nLet the comfort contain a threat\n微风吹灭蜡烛=温柔+毁灭\n\n③ 不要分开说——同一个句子里完成\nDon't separate them — do it in one phrase\n\n⚡ 关键：毒药和解药是同一个东西\nKey: the poison and the remedy are the same thing",
    examples: [
      { zh: "The breeze will blow my candle out, I don't feel anything", en: "微风会吹灭我的蜡烛，我什么都感觉不到", source: "Dr. Dog", hint: "童谣般的温柔节奏+存在主义的虚无——同一口气", featured: true },
    ],
  },
  earned_ignorance: {
    group: "structure",
    label: "Earned ignorance",
    prompt: "Architecture of earned ignorance: the speaker has learned more but understands less. Knowledge deepens the mystery instead of solving it.\nExemplar: \"I've looked at life from both sides now... I really don't know life at all\" (Mitchell) — seeing both sides produces not wisdom but awe.",
    method: "① 建立知识/经验\nEstablish knowledge: \"I've looked at clouds from both sides now\"\n\n② 让知识导向更深的不知\nLet knowledge lead to deeper unknowing\n看了两面 → 但不是更懂了，是更不懂了\n\n③ 不知是赚来的，不是天真的\nThe not-knowing is earned, not naive\n\n⚡ 关键：这不是谦虚，是认知的诚实\nKey: this isn't humility — it's cognitive honesty",
    examples: [
      { zh: "I've looked at clouds from both sides now... I really don't know clouds at all", en: "我从两面看过了云……但我真的完全不了解云", source: "Joni Mitchell", hint: "经验越多，理解越少——知识产生的不是答案而是敬畏", featured: true },
    ],
  },
  empathy_danger: {
    group: "structure",
    label: "Dangerous empathy",
    prompt: "Empathy as the most dangerous act: understanding another person so deeply that the boundary between self and other dissolves. Seeing a monster's humanity implicates the viewer.\nExemplar: Sufjan Stevens' \"John Wayne Gacy, Jr.\" — domestic detail makes a serial killer's life recognizable, then the final line implicates the speaker.",
    method: "① 用家常细节描述一个你本该厌恶的人\nDescribe someone you should despise using domestic detail\n\n② 让细节太具体、太熟悉\nMake the details too specific, too familiar\n\n③ 在最后暗示：我和他/她没有那么不同\nAt the end, imply: I'm not so different\n\n⚡ 关键：共情不是同情——是发现自己也在里面\nKey: empathy isn't sympathy — it's discovering yourself inside the other",
    examples: [
      { zh: "And in my best behavior, I am really just like him", en: "在我最好的表现下，我真的跟他一样", source: "Sufjan Stevens", hint: "写了一个连环杀手的日常生活后，最后一行指向自己", featured: true },
    ],
  },

  high_low: {
    group: "structure",
    label: "High-low contrast",
    prompt: "Mix the mundane and the sublime in the same line. Kitchen table next to cosmos. Domestic detail next to infinity. The collision of scale creates meaning.\nExemplar: \"Jesus, don't cry — you can rely on me, honey\" (Wilco) — divine + domestic in one breath.",
    method: "① 选一个崇高的事物（宇宙、上帝、永恒）\nPick something sublime: the cosmos, God, eternity\n\n② 选一个日常的事物（厨房、袜子、茶杯）\nPick something mundane: kitchen, socks, teacup\n\n③ 放在同一行里，不解释为什么\nPut them in the same line, don't explain\n\n⚡ Robin Pecknold：高低对比产生的张力最真实\nHigh-low contrast creates the most genuine tension",
    examples: [
      { zh: "Jesus, don't cry — you can rely on me, honey", en: "耶稣别哭——你可以依靠我，亲爱的", source: "Wilco", hint: "神圣（Jesus）+ 家常（honey）——同一口气里", featured: true },
      { zh: "Imagine there's no heaven, it's easy if you try", en: "想象没有天堂，试试看很容易", source: "John Lennon", hint: "最激进的哲学命题，用最平淡的语气说出来", featured: true },
    ],
  },

  // ── Stance Modifiers ─────────────────────────────────────────────
  present_tense: {
    group: "stance",
    label: "Present tense",
    prompt: "Write in strict present tense. Inhabit the moment. No looking back, no looking ahead. The line IS the moment happening.\nExemplar: Adrianne Lenker's approach — every line a present-tense inhabitation, not a recollection.",
    method: "⚡ 不要说「我记得那天的厨房」\nDon't say \"I remember the kitchen\"\n说「厨房里有光，水壶在响」\nSay \"light in the kitchen, the kettle sings\"\n\n现在时 = 读者在场景里面，不是在看场景\nPresent tense = reader inside the scene, not watching it",
    examples: [],
  },
  portrait: {
    group: "stance",
    label: "Portrait",
    prompt: "Portrait over confession: describe from the outside, imply the interior. Show, don't emote. The speaker is a camera, not a diarist.\nExemplar: Laura Marling — \"she turned the teacup three times before setting it down\" instead of \"she was sad\".",
    method: "⚡ 不要说情绪，描述行为\nDon't name the emotion, describe the behavior\n「她很难过」→「她把茶杯转了三圈才放下」\n\"She's sad\" → \"She turned the cup three times\"\n\n行为比情绪更具体、更真实、更有力\nBehavior is more specific, more true, more powerful",
    examples: [],
  },
  humor: {
    group: "stance",
    label: "Humor / play",
    prompt: "Let humor and play leak in. Playfulness is not the enemy of depth. A line that makes you smile and then cuts you is twice as powerful.\nExemplar: \"You were right about the stars, each one is a setting sun\" (Wilco) — deadpan observation that turns cosmic.",
    method: "⚡ 幽默不是搞笑——是用轻的方式说重的事\nHumor isn't comedy — it's saying heavy things lightly\n\n让读者先笑，然后意识到这其实很疼\nMake the reader smile, then realize it hurts",
    examples: [],
  },
  in_medias_res: {
    group: "stance",
    label: "In medias res",
    prompt: "Start in the middle. No setup. The line drops us into an already-moving scene. We catch a moment mid-flight.\nExemplar: \"I was walking with a ghost\" (Tegan and Sara) — no explanation of who, why, or where. Just the moment.",
    method: "⚡ 不要铺垫，直接进入\nNo setup, jump straight in\n\n好的第一行让你觉得你错过了什么\nA good opening line makes you feel you missed something\n读者会自己补上前面的故事\nThe reader fills in what came before",
    examples: [],
  },
  withholding: {
    group: "stance",
    label: "Withholding",
    prompt: "Chekhov's gun in miniature: the line should withhold something that the listener feels is missing. The absence has weight. What's NOT said is louder than what is.\nExemplar: \"Ticket stub soft in my back pocket\" — we never learn who gave it or where they went. The stub carries everything unsaid.",
    method: "⚡ 不要说完——留一个空位给读者\nDon't finish — leave a space for the reader\n\n最好的留白让人感觉「还有什么你没说」\nThe best withholding makes people feel: \"there's something you're not saying\"\n\n一张旧照片，没说是谁的 → 读者自己填\nAn old photo, no name → the reader fills in",
    examples: [],
  },
};

// ── Metaphor Toggle (binary, not a spectrum) ───────────────────────

const METAPHOR_HINT = "Dense metaphor mode. Every line works through image, collision, substitution. Objects stand for feelings. The literal meaning is never the real meaning. Use subjective imagery — images that can't exist in reality but feel truer than fact.";

// ── Prompt Assembly ─────────────────────────────────────────────────

/**
 * Build the system instructions for a line-craft generation call.
 *
 * @param {object} opts
 * @param {object} opts.spectrums  - { orientation, stability, distance } each -1 to 1, 0 = neutral
 * @param {string[]} opts.micros   - array of MICRO_PRINCIPLES keys to activate
 * @returns {string}
 */
export function buildSystemPrompt({ spectrums = {}, micros = [], metaphor = false } = {}) {
  const parts = [CORE_IDENTITY];

  const hints = Object.entries(SPECTRUMS)
    .map(([key, spec]) => spec.buildHint(spectrums[key] ?? 0))
    .filter(Boolean);
  if (metaphor) hints.push(METAPHOR_HINT);
  if (hints.length > 0) {
    parts.push("# Creative direction\n" + hints.join("\n"));
  }

  // Separate formula from other micros — formula gets enforcement
  const activeFormula = micros.find((key) => MICRO_PRINCIPLES[key]?.group === "formulas");
  const otherMicros = micros.filter((key) => key !== activeFormula);

  if (activeFormula && activeFormula !== "formula_auto") {
    const formulaPrompt = MICRO_PRINCIPLES[activeFormula].prompt;
    parts.push("# Imagery Formula (use in most lines — 1-2 pure observations allowed)\n" + formulaPrompt);
  } else if (activeFormula === "formula_auto") {
    parts.push("# Imagery Formula\n" + MICRO_PRINCIPLES.formula_auto.prompt);
  }

  const activeMicros = otherMicros
    .map((key) => MICRO_PRINCIPLES[key]?.prompt)
    .filter(Boolean);
  if (activeMicros.length > 0) {
    parts.push("# Additional Principles (layer ALL of these in every line)\n" + activeMicros.join("\n"));
  }

  return parts.join("\n\n");
}

/**
 * Build the user prompt for initial generation.
 */
export function buildGeneratePrompt({ seed, subject = "", count = 8 } = {}) {
  const parts = [
    `${count} lines. Seed: "${seed}"`,
  ];

  if (subject) {
    parts.push(`Constraint: ${subject}`);
  }

  parts.push(
    "Each line standalone. Each looks at the seed from a different angle or detail.",
    "Vary the approach: some observational, some with a turn, some just a single image held still.",
    "4–10 words per line. JSON only.",
  );

  return parts.join("\n");
}

/**
 * Build the user prompt for iteration (push harder, more like this, shift).
 */
export function buildIteratePrompt({ parentLine, seed, action = "push", count = 4 } = {}) {
  const header = `Line: "${parentLine}"\nSeed: "${seed}"`;
  const actionInstructions = {
    push: `${header}\n${count} variations. Go deeper into the feeling. More specific. More honest. Less safe.`,
    more: `${header}\n${count} variations. Same emotional territory, different angle or detail.`,
    shift: `${header}\n${count} variations. Completely different approach — if descriptive, go confessional. If close, go far. If stable, go unstable.`,
  };

  return (actionInstructions[action] || actionInstructions.push) + "\n4–10 words per line. JSON only.";
}

/**
 * Build the user prompt for critique mode.
 */
export function buildCritiquePrompt({ line } = {}) {
  return [
    `Critique this lyric line against craft principles:`,
    `"${line}"`,
    "",
    "Evaluate:",
    "- Sense-bound language: Is it rooted in the senses or floating in abstraction?",
    "- Cliché check: Any dead phrases, stock images, or predictable moves?",
    "- Verb strength: Are verbs carrying the weight, or leaning on adjectives?",
    "- Specificity: Is it concrete enough to be universal?",
    "- Surprise: Is there at least one unexpected element?",
    "- Compression: Could any word be cut without loss?",
    "- Imagery: Does the metaphor (if any) create genuine collision?",
    "",
    "Be honest and specific. Name the weak spots. Suggest one concrete revision direction.",
    "Return JSON only.",
  ].join("\n");
}

// ── JSON Schemas for Structured Output ──────────────────────────────

export function buildLineSchema(count = 8) {
  return {
    type: "json_schema",
    name: "lyric_lines",
    strict: true,
    schema: {
      type: "object",
      properties: {
        lines: {
          type: "array",
          items: {
            type: "object",
            properties: {
              line: { type: "string", description: "The lyric line" },
              craft_notes: { type: "string", description: "Brief note on what drives the line" },
            },
            required: ["line", "craft_notes"],
            additionalProperties: false,
          },
          description: `Array of ${count} lyric lines`,
        },
      },
      required: ["lines"],
      additionalProperties: false,
    },
  };
}

export function buildCritiqueSchema() {
  return {
    type: "json_schema",
    name: "lyric_critique",
    strict: true,
    schema: {
      type: "object",
      properties: {
        strengths: {
          type: "array",
          items: { type: "string" },
          description: "What works well in the line",
        },
        weaknesses: {
          type: "array",
          items: { type: "string" },
          description: "Specific weak spots",
        },
        revision_direction: {
          type: "string",
          description: "One concrete suggestion for how to push the line further",
        },
      },
      required: ["strengths", "weaknesses", "revision_direction"],
      additionalProperties: false,
    },
  };
}

// ── Exports for UI ──────────────────────────────────────────────────

export const SPECTRUM_LIST = Object.entries(SPECTRUMS).map(([key, val]) => ({
  key,
  label: val.label,
  description: val.description,
}));

export const MICRO_PRINCIPLE_LIST = Object.entries(MICRO_PRINCIPLES).map(([key, entry]) => ({
  key,
  label: entry.label,
  description: entry.prompt,
  method: entry.method || "",
  group: entry.group,
  examples: entry.examples || [],
}));

export const MICRO_GROUPS = [
  { key: "formulas", title: "意象公式 Imagery Formulas", subtitle: "黄梵《意象的帝国》", exclusive: true },
  { key: "techniques", title: "手法 Techniques", subtitle: "黄梵", exclusive: false },
  { key: "structure", title: "Structural Moves", subtitle: "Benchmark songs + teachers", exclusive: false },
  { key: "stance", title: "Stance", subtitle: "Modifiers", exclusive: false },
];
