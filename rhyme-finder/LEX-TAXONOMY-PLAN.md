# Lex-category taxonomy redesign — audit + implementation plan

**Status:** ✅ 已实施(2026-07-10)。§5 算法、§6 三个决策、§7 九步全部落地,
§8 换成实测数字。此后本文件是**设计记录**,不是待办清单。
**Last updated:** 2026-07-10.
**Owner context:** rhyme-finder's "lexicon" filter chips (Common / Names /
Places / Sciences) and their data source
`rhyme-finder/wordlists/wordnet-categories.json`.

This doc has two halves: (A) the **audit** — what's wrong today, with
numbers; (B) the **redesign** — a new taxonomy, the exact classification
algorithm, decision points, and a file-by-file implementation checklist.

Prose is in Chinese for the reviewer; all specs/algorithm/paths in English
so the implementer can act precisely.

---

## 0. TL;DR

今天的 4 个分类桶(`common / person / place / science`)由
`scripts/buildWordnetCategories.mjs` 生成,用的是**"WordNet 主导语义域
(dominant lexname)"** + **"高频词强制归 common"** 两条规则。审计发现两条
规则都错得很系统:

- **person 桶 60.2% 是误标**(4135/6870):barrister、sorceress、
  mycologist 这类**普通职业名词**被当成"人名"。
- **science 桶 43.5% 是拉丁学名噪音**(5141/11810):abies、accipiter、
  pseudomonas —— 纯词典残渣,不该出现在候选里。
- **common 桶里混进 1097 个真专名**(madonna、cuba、russia):因为它们高频,
  被 corpus-override 规则强制标 common,于是 Names/Places chip 关不掉它们。
- **主导语义域对专名彻底不可靠**:venus/vanessa/lincoln 因为有冷门的
  蛤蜊属/蝴蝶属义项被判成"科学词",colorado/africa/alps 被判成"物件"。

**根因**:把两条正交的轴混成了一条——"**是不是专名**"(靠大写/instance 标记,
**可靠**)和"**属于哪个语义领域**"(靠 lexname,**对专名不可靠**),而"生僻度"
这条轴其实已经由 lyricScore/排序/tier 系统在处理,不该再塞进分类。

**方案**:分类只承载"专名 vs 普通词"这一条可靠的轴,细分到
songwriter 真正会用的粒度:

| 新桶 | 是什么 | 判定信号(可靠) |
|---|---|---|
| **Common** | 一切普通词(动词/形容词/副词 + 普通名词,含自然词如 nitrogen/mongoose) | 有小写非-instance 义项,或非名词词性 |
| **Names** | 人名、神名、拟人化、民族/居民称谓 | 全专名 + 有 person(lex 18)义项 |
| **Places** | 地名(城市/国家/地区) | 全专名 + 有 location(lex 15)义项 |
| **Proper** | 其余专名:品牌、组织、缩写、神话物、宗教/主义、语言、作品 | 全专名 + 既非 person 也非 location |
| *(剔除)* | 拉丁分类学属名 | 全专名 + 全部义项 ∈ {animal,plant,substance} + 不在词频表 |

生僻词(feldspar/telomere)**不单独设 chip**——见 §4 对"能不能可靠找出
science/nature 词"的回答:不能,而且没必要,排序系统已经把它们沉到
"show more"。

---

## 1. 今天怎么工作的(current design)

### 1.1 数据流

```
scripts/buildWordnetCategories.mjs
   └─ 读 WordNet data.noun/verb/adj/adv + common-10k.txt + lyric-frequency.json
   └─ 输出 rhyme-finder/wordlists/wordnet-categories.json
         { common:[...], person:[...], place:[...], science:[...] }
              │
              ├─→ rhyme-finder/src/rhymeFinder.js
              │      • WORD_LEX = Map<word, cat>  (每个候选的 lex 字段)
              │      • 同时是 "真词" 门槛:isAcceptableWord 要求 WORD_LEX.has(word)
              │
              └─→ scripts/buildCmuDict.mjs
                     • commonishNouns = common ∪ science  → 决定哪些名词合成 -s 复数
```

lex 字段的**唯一用途是筛选 chip**(main.js 的 `LEX_LABELS/LEX_ORDER`,
CSS 的 `[data-lex]` 隐藏规则)。**它不参与排序**——排序完全由 lyricScore
决定。所以改分类不会让任何词排到后面去,只影响"勾掉某个 chip 时谁被隐藏"。

### 1.2 现有分类规则(两条,都有问题)

`buildWordnetCategories.mjs` 的 `classifyLemma()`:

1. **主导语义域**:一个名词若所有义项都落在 person/place/science 的
   lexname 里,就按"占多数的那个 lexname"归类;否则归 common。
2. **corpus-override**:任何出现在 top-10k 或 lyric 语料里的词,无视 WordNet
   一律强制 `common`(初衷:"cat" 属 noun.animal 但它是大白话)。

---

## 2. 审计结果(numbers)

审计方法:从原始 WordNet `data.noun` 重新解析,保留每个义项的**大写标记**
(专名在 WordNet 里首字母大写)和 **instance 标记**(`@i` 指针 = 具名实体,
如"具体某座城市/某个人")。判据:

> **真专名(truly proper)** = 一个 lemma 的**每一个**义项都是"大写"或
> "instance"。只要有一个**小写且非-instance** 义项,它就有普通词用法
> (baker 既是姓 Baker 也是"面包师"→普通词)。

复核脚本见 §9 附录(可重跑)。结果:

### 2.1 person 桶:60% 是普通职业名词

```
person 桶 (6870):  真专名 2735 (39.8%)   普通词误标 4135 (60.2%)
```

误标样本(全是能唱的普通词,却被 Names chip 当人名隐藏):
`barrister, sorceress, mycologist, homesteader, seductress, renovator,
theatregoer, handicapper, cannoneer, inheritor, watercolorist …`
其中 **1450 个有 CMU 发音**(会真的出现在结果里)。

### 2.2 place 桶:11.5% 是普通词

```
place 桶 (1732):   真专名 1533 (88.5%)   普通词误标 199 (11.5%)
```

误标样本:`borough, hangout, birthplace, campsite, hayfield, diocese,
enclave, midpoint, hemline …`(其中 83 个有 CMU 发音)。

### 2.3 science 桶:43% 是拉丁学名噪音

```
science 桶 (11810): 拉丁属名 5141 (43.5%)   普通自然词 6669 (56.5%)
```

- **拉丁属名**(该剔除):`abies, accipiter, pseudomonas, acanthurus …`
  ——纯词典残渣,只有 113 个有 CMU 发音会泄漏进结果。
- **普通自然词**(该归 common):`nitrogen, mongoose, aardvark, ammonia,
  feldspar, groundhog …` ——能唱的词。

### 2.4 common 桶:1097 个真专名被高频规则拖进来

corpus-override 把高频真专名强制标 common,于是 Names/Places chip 关不掉:
- **820 人名**:`aaron, byron, churchill, jones, madonna, shelley …`
- **277 地名**:`cuba, russia, alaska, dublin, delhi, naples …`

### 2.5 致命问题:主导语义域对专名根本不可靠

用"占多数的 lexname"给专名分类,会被 WordNet 的冷门义项带偏(实测样本):

| 词 | 被判成 | 因为 WordNet 有 | 其实是 |
|---|---|---|---|
| venus, vanessa | science(动物) | 蛤蜊属 / 蝴蝶属 | 神名 / 人名 |
| lincoln | science(动物) | 一种线虫? | 人名/地名 |
| colorado, africa, alps | object(物件) | 各种 object 义项 | 地名 |
| gemini, leo, capricorn | place(地点) | —— | 星座 |
| paris | (sense-1 是 plant) | 一种草本 herb Paris | 地名 |
| illinois, kansas, alabama | (sense-1 是 person) | 印第安部落名 | 州名 |

结论:**领域细分(尤其"science")不能从 lexname 可靠得到。** 唯一可靠的
信号是"大写/instance = 专名",以及"有没有 person/location 义项"这种
**集合成员**判断(而非"占多数")。

---

## 3. 根因诊断

现有分类把**两条正交的轴**塞进了一个字段:

1. **专名 vs 普通词**(proper vs common)——songwriter 关心"这是个名字吗,
   我这首歌想不想点名"。**可靠**:大写 + instance 标记。
2. **语义领域**(person/place/animal/plant/…)——用 lexname。对**专名不可靠**
   (§2.5);对普通词可靠但没必要(见下)。
3. **生僻度**(familiarity)——nitrogen 常见、telomere 没人听过。这条轴
   **工具已经在处理了**:lyricScore = lyric 语料出现次数 ×200 + top-7000
   词频回退;排序 + tier 把生僻词沉到 "show more"。

现有规则的两个错误正是"轴串了":
- 用**语义域(轴2)**给专名分类 → 被冷门义项带偏(venus→动物)。
- 用**高频(轴3)**决定**是不是 common(轴1)** → 高频专名被吞进 common
  (madonna→common),chip 语义失真。

**修复原则:分类字段只承载轴1(专名与否 + 人/地/其他),彻底交给可靠信号;
轴3 留给已有的排序系统,不再设"生僻/科学"chip。**

---

## 4. 直接回答你的几个问题

> **"technically 哪种 taxonomy 最方便和正确?"**

按"**专名与否**"分,不按"语义领域"分。因为:大写/instance 标记是 WordNet
里最干净、覆盖最全的信号;而 lexname 对专名会被冷门义项污染(§2.5)。
person/location 用"**是否含该义项**"(集合成员)而非"占多数",可靠得多。

> **"我们真的能可靠找出 science / nature 的词汇吗?"**

**不能,而且不需要。** 两个原因:
1. **famous names 污染领域**:venus/vanessa/lincoln 都带动植物属名义项,
   领域信号分不开真名和真自然词。
2. **"生僻"是连续谱,不是二元类**:你自己给的排序 nitrogen(正常)>
   mongoose(可用)> feldspar(少见)> telomere(没听过)其实是按
   **生僻度**排的——连续谱属于排序,不属于开关。score==0 也没法当"生僻"
   开关:它会把 carrot/hen/puppy 这种普通词一起误杀(它们只是不在词频表里)。

所以:**普通自然词(nitrogen/mongoose)→ Common**;真正生僻的
(telomere/feldspar)由排序自动沉到 "show more",无需 chip;**拉丁学名
(abies)直接剔除**出候选池。

> **"英文有没有专有名词 / 生僻字的说法?"**(给标签用的词汇)

- 专名统称:**proper noun** / **proper name**。人名 = **Names**;
  地名 = **Places**;其余专名合并桶,单词标签建议 **"Proper"**
  (tooltip: "Brands, groups, mythology & other proper names"),
  备选 "Brands"(太窄,不推荐)/ "Named"。**不要用 "Other"。**
- 生僻词的英文:**obscure / rare / archaic / technical / jargon**。
  (本方案不设这个 chip,理由如上;词汇给你备用。)

---

## 5. 新分类算法(the spec)

在 `buildWordnetCategories.mjs` 里,对每个 lemma:

```
INPUT per lemma: the set of its WordNet noun senses, each with
  { cap: bool, instance: bool, lex: lexnum }
plus: isVerbAdjAdv (lemma appears in index.verb/adj/adv)
      familiar(word) = lyricScore>0  (in lyric corpus OR common-10k rank<7000)

CONSTANTS:
  SCIENCE_LEX = {5 animal, 20 plant, 27 substance}   // NOT 8 body
  CALENDAR    = {7 weekdays, 12 months, seasons, ~12 holidays}  // closed allowlist

classify(word, senses):
  1. if isVerbAdjAdv(word):                       return "common"
  2. if senses is empty (noun-only path n/a):     return null   // not a real word
  3. hasCommonSense = any sense with (!cap && !instance)
     if hasCommonSense:                           return "common"
  // ---- from here: truly proper (every sense cap-or-instance) ----
  4. if every sense.lex ∈ SCIENCE_LEX AND !familiar(word):
                                                  return DROP   // latin taxon → excluded
  5. if word ∈ CALENDAR:                          return "common"  // monday/june/xmas sing like common words
  6. if any sense.lex == 15 (location):           return "place"   // ← precedence knob, see §6
  7. if any sense.lex == 18 (person):             return "name"
  8. otherwise:                                   return "proper"
```

关键点:
- **第 1–3 步就把普通词全部收走**(动/形/副,以及任何带普通义项的名词),
  这是修复 person/place 误标的核心:barrister/borough 有小写普通义项 →
  common。
- **corpus-override 规则删除**:高频不再决定 common(轴1),madonna→Names、
  cuba→Places 由 WordNet 决定。高频只影响排序。
- **familiar 只在两处用**:(a) 第 4 步保护——万一某个拉丁属名恰好进了词频表
  就不剔除;(b) 报告统计。**绝不用它决定 common vs proper。**
- **CALENDAR 是唯一的手工闭集**(~35 词):日历词是专名但在歌里当普通词用
  (September/Sunday morning/December),不该被 Proper chip 隐藏。闭集、
  一次性、必然正确,符合 CLAUDE.md "闭集允许硬编码"。

### 5.1 判定所需的两个 WordNet 解析细节(实现须知)

1. **大写**:`data.noun` 每行的义项 lemma 若首字母大写 = 专名义项。
   解析时**保留原始大小写**再判断,不要先 toLowerCase(现有 builder 一上来
   就 toLowerCase,丢掉了这个信号——这是根因之一)。
2. **instance**:该 synset 行含 `@i` 指针(instance hypernym)= 具名实体。
   用于把"具体的宙斯/具体的雅典"这类即便某些拼写没大写也算专名。

### 5.2 输出格式

保持 `{ common, name, place, proper }` 四键(把 `person`→`name`、
`science`→`proper` 重命名;见 §6 决策 3)。**文件仍收录全部真词**(不只
CMU-backed),因为它同时是 rhymeFinder 的"真词门槛"。被 DROP 的拉丁属名
从文件里去掉 = 从候选池剔除。

---

## 6. 三个决策点(已拍板,2026-07-10)

**已定:** (1) place 优先 + 10 词人名 override(`NAME_OVERRIDE`,见
`buildWordnetCategories.mjs`);washington / lincoln / monroe / madison /
jackson 按默认留在 Places——城市读法不弱于姓氏读法。(2) 合并桶标签
**"Proper"**,tooltip "Brands, groups, mythology & other proper names"。
(3) 键名重命名 `person→name`、`science→proper`。

### 决策 1 — person ∩ place 重名词的归属(唯一的真·难点)

有 **100 个专名同时带 person 和 location 义项**(46 个高频),自动 tiebreak
**不可靠**(sense-1 也会翻车:paris 的 sense-1 是植物,illinois 的 sense-1 是
部落名)。§5 算法第 6 步默认 **place 优先**(location 义项 → Places),理由:
这 46 个高频重名里地名显著的更多(states/cities:illinois、kansas、london、
paris、washington),place 优先误标更少。

**建议**:place 优先 **+ 一份 ~15 词的人名 override**(把明显是人的救回
Names)。完整 46 词见 §9 附录,由实现者(或你)眼过一遍勾人名。
需要你定:(a) 认可 place 优先默认吗?(b) 人名 override 由 Opus 按附录列表
自行判定,还是你亲自圈?

### 决策 2 — 合并桶 "Proper" 的标签用词

内容 = 品牌/组织/缩写/神话物/宗教主义/语言/作品(§2 landscape)。
建议 chip 标签 **"Proper"**,tooltip "Brands, groups, mythology & other
proper names"。你若有更喜欢的单词(Named / Labels / …)在此定;**不要
"Other"**(你已否)。

### 决策 3 — 内部键名要不要重命名

`person→name`、`science→proper` 语义更诚实,但要改 6 处(HTML data-filter-*、
CSS `[data-lex]` 与 `--lex-*` 变量、main.js、rhymeFinder.js)。**建议重命名**
(一次性机械改动,长期可读)。若想最小改动,可保留 `person/science` 键只换
显示标签——不推荐,会给后来人留坑。§7 按"重命名"写。

---

## 7. 实施清单(file-by-file,按顺序)

> ⚠️ 这是一次**扫全词典的数据层改动**。按 CLAUDE.md 规则,fixtures 必须和
> 改动**同一个 commit**,且要覆盖每条边界的**两侧**(什么进 / 什么必须留在
> 原处)。

### Step 1 — 重写分类器 `scripts/buildWordnetCategories.mjs`
- 解析 `data.noun` **保留大小写 + instance(`@i`)标记**(§5.1)。
- 实现 §5 的 `classify()`;删除 `classifyLemma()` 的主导-lexname 逻辑和
  corpus-override 分支。
- 引入 `familiar()`(读 lyric-frequency.json + common-10k.txt,复刻
  lyricScore 的 >0 判定)、`CALENDAR` 闭集、`SCIENCE_LEX`。
- 输出四键 `{ common, name, place, proper }`;DROP 的词不写入。
- 保留 verb/adj/adv → common 与"收录全部真词"的行为。

### Step 2 — 同源修复合成门槛 `scripts/buildCmuDict.mjs`
`properOnlyNouns`(第 95–116 行)现在用"所有义项 ∈ {15,18}"判专名,会误伤
**带普通义项的角色名词**(tsar/oboist/archduke →复数被拦),审计发现
**981 个此类复数缺失**。改成与分类器一致的判据:
- `properOnlyNouns` 应是"**truly proper**"(无小写非-instance 义项),
  不是"所有义项 person/place"。加上 `hasCommonSense` 检查。
- 这样 baker→bakers、tsar→tsars、oboist→oboists 能正常合成。
- `commonishNouns` 现在会自动包含从 person 桶移到 common 的职业名词
  (因为它读 `cats.common`),配合上面就补齐了 981 个洞。

### Step 3 — 重新生成数据 + 全量派生重建(有先后)
```sh
node scripts/buildWordnetCategories.mjs      # 新 wordnet-categories.json
node scripts/buildCmuDict.mjs                # 分类变了 → 合成集变 → cmu-dict.json 变
# cmu-dict.json 在 derivedConsistency 哈希内 → 必须重建桶 + SEO:
node scripts/buildLyricBuckets.mjs
node scripts/buildSeoPages.mjs
```
> 为什么触发全量重建:分类把 4135 个职业名词从 person 挪到 common,
> `commonishNouns` 变大 → 合成更多 -s 复数 → `cmu-dict.json` 变 →
> 命中 `test/derivedConsistency.test.js` 的哈希(它 hash 了 cmu-dict.json)。

### Step 4 — 运行时枚举 `rhyme-finder/src/rhymeFinder.js`
- 第 47 行 `for (const lex of ["common","person","place","science"])`
  → `["common","name","place","proper"]`。
- 第 269 行注释 `common | person | place | science` → 新四类。
- 其余逻辑(WORD_LEX 门槛、lex 字段)不变。

### Step 5 — UI 标签/计数 `rhyme-finder/src/main.js`
- `LEX_LABELS`(2373):`{ common:"Common", name:"Names", place:"Places",
  proper:"Proper" }`。
- `LEX_HINTS`(2377):name→"People, deities & nationalities";
  place→"Cities, countries & regions";proper→决策 2 的 tooltip。
- `LEX_ORDER`(2383):`["common","name","place","proper"]`。
- `counts` 对象(2415)与任何硬编码 `science`/`person` 的地方同步。

### Step 6 — HTML 属性 `rhyme-finder/index.html`
- 135–138 行:`data-filter-person/place/science`
  → `data-filter-name/place/proper`(common 不变)。

### Step 7 — CSS `rhyme-finder/styles.css`
- 2535–2559(徽标 `::after` 与隐藏规则)、2662–2673(chip 勾选态):
  把 `person→name`、`science→proper` 全部替换。
- CSS 变量 `--lex-person`→`--lex-name`、`--lex-science`→`--lex-proper`
  (改名或新增;颜色沿用即可)。
- 徽标 `content: attr(data-lex)`(2538)会显示新值 `name/proper`——确认
  文案可接受,或改成按值给固定文案。

### Step 8 — 测试(与改动同 commit)
- `test/rhymeClassifier.test.js`:新增"分类边界"fixtures,每条边界两侧都要:
  - person:`baker→common`(有职业义)vs `madonna→name`(纯专名)
  - place:`borough→common` vs `cuba→place`
  - science-drop:`mongoose→common`(自然普通词)vs `abies→不在候选`(taxon)
  - proper:`fbi→proper`、`tylenol→proper` vs `monday→common`(calendar)
  - overlap:决策 1 定的样例(如 `paris→place`、`kennedy→name`)
  - 生僻仍出:`telomere→common`(证明它没被误当 taxon 剔除)
  > 若这些断言不便放进 rhymeClassifier(它测的是韵律分类,不是 lex),
  > 新建 `test/lexCategories.test.js` 直接对 wordnet-categories.json 断言更干净。
- `test/derivedConsistency.test.js`:重建后自动变绿(哈希已随 Step 3 更新)。
- **建议加固**:把 `rhyme-finder/wordlists/wordnet-categories.json` 加入
  `buildLyricBuckets.mjs` 的派生哈希输入(目前只 hash 了 cmu-dict/overrides/
  两个 .js)。理由和 CLAUDE.md 里"合并 bug"教训一致:分类文件能在不改
  cmu-dict 的情况下改变运行时候选,应让守卫看得见。

### Step 9 — 文档
- 更新 `CLAUDE.md` "Shared resources → CMU overrides / wordnet-categories"
  段:描述新四类、判据(cap/instance,不是 lexname)、CALENDAR 闭集、
  以及"改分类 = 全量派生重建"。
- 更新本文件的 §8 预期数字为实际重建结果。

---

## 8. 实测效果(2026-07-10 重建后)

文件全量(含无发音的词——它同时是 rhymeFinder 的"真词门槛"):

| 桶 | 词数 | 其中有 CMU 发音(会真正出现) |
|---|---|---|
| common | 77,458 | 37,739 |
| **name** | 3,609 | 2,017 |
| place | 2,019 | 1,194 |
| **proper** | 2,671 | 734 |
| *(剔除 taxa)* | 5,126 词不写入 | 其中 103 个有发音,过去会泄漏进结果 |

`buildCmuDict` 的合成门槛同源修复后:**+818 个合成形式**
(bakers / tsars / oboists / archdukes / abbes …),**−918 个专名复数噪音**
(africas / abyssinians / advils / dianas / egypts …)。

⚠️ 重建还顺带清掉了 8,168 个**陈旧词条**——旧 `wordnet-categories.json`
是在语料分词器还保留所有格的年代生成的(`aaron's` / `actor's` / `abs`),
自那以后 `lyric-frequency.json` 重建过两次而分类文件没跟着重建。这批消失
与本次算法改动无关:用**旧 builder** 跑今天的输入,同样得到 85,757 词。
(这正是把 `wordnet-categories.json` 纳入派生哈希的理由,见 §7 Step 8。)

抽查验证(实测,`test/lexCategories.test.js` 里已固化):
`madonna→name, cuba→place, baker→common, venus→name, monday→common,
dane→name, nitrogen→common, feldspar→common, telomere→common,
fbi→proper, tylenol→proper, abies→DROP, paris→place, kennedy→name` ✓

---

## 9. 附录

### 9.1 person ∩ place 高频重名词(决策 1 用,46 个,需人工勾人名)

```
alabama beaumont berkeley capricorn cleveland clinton constantine dakota
decatur delaware erie eugene france gemini hamilton houston huntington
illinois indiana jackson judah kansas kennedy kent lafayette lawrence leo
lincoln london madison miami missouri molotov monroe montgomery muskogee
omaha paris ra raleigh sherman taurus tyler victoria washington yuma
```
明显人名(建议进 name override):`kennedy, hamilton, clinton, lawrence,
victoria, constantine, judah, molotov, sherman, tyler, madison`。
明显地名(留 place):其余 states/cities(illinois/kansas/london/paris/
washington…)。星座 `taurus/gemini/leo/capricorn` 归 name(神名义)或
proper,由决策 2 顺带定。人+地都极强的(washington/lincoln/monroe/madison/
jackson)按决策 1 的 place 优先默认走 Places,除非你把它勾进人名 override。

### 9.2 复核脚本

审计与验证脚本(可重跑,依赖仓库的 `wordnet-db` / `cmu-dict.json` /
`lyric-frequency.json` / `common-10k.txt`)在实现时重建即可;核心解析逻辑:

```js
// 保留大小写 + instance 标记地解析 data.noun
import { createRequire } from "node:module";
const wndb = createRequire("<repo>/package.json")("wordnet-db");
// 每行:offset lexnum ss_type w_cnt(hex) [word lex_id]... ptr... | gloss
//   cap      = word[0] !== word[0].toLowerCase()
//   instance = / @i /.test(headBeforeGloss)
//   lex      = parseInt(parts[1], 10)
// truly-proper(lemma) = every sense (cap || instance)
// hasCommonSense(lemma) = some sense (!cap && !instance)
```

完整审计脚本本次跑在 session scratchpad,产出上述所有数字;实现者可据
§5 算法直接落进 `buildWordnetCategories.mjs` 并用 §8 抽查表回归。
