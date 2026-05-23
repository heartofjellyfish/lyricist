// Shared mock dataset used by all three corpus-redesign demos.
// Searching "dream"; top group inflated to 60 instances so the
// batch-reveal mechanic is exercised. Other groups carry real-feeling
// attribution.

window.MOCK_GROUPS = (() => {
  const screenReal = [
    { a: "That could flash on the screen", aWord: "screen", b: "What a beautiful dream", artist: "Joni Mitchell", song: "The Last Time I Saw Richard", year: 1971 },
    { a: "We danced behind the silver screen", aWord: "screen", b: "Held a kiss inside a dream", artist: "Sufjan Stevens", song: "Carrie & Lowell", year: 2015 },
    { a: "Through the haze of cigarette screen", aWord: "screen", b: "I almost touched her in a dream", artist: "Lana Del Rey", song: "Mariners Apartment Complex", year: 2019 },
    { a: "A flicker on the morning screen", aWord: "screen", b: "Was that you, or just a dream?", artist: "Adrianne Lenker", song: "Anything", year: 2020 },
    { a: "Behind the chain-link, behind the screen", aWord: "screen", b: "She lived the only kind of dream", artist: "Bruce Springsteen", song: "The River", year: 1980 },
  ];
  for (let i = 0; i < 55; i++) {
    screenReal.push({
      a: `Line ending in screen (#${i + 6})`,
      aWord: "screen",
      b: `Partner line ending in dream (#${i + 6})`,
      artist: ["Joni Mitchell", "Adrianne Lenker", "Sufjan Stevens", "Townes Van Zandt", "Laura Marling", "Leonard Cohen", "Bob Dylan"][i % 7],
      song: `Demo song ${i + 6}`,
      year: 1965 + ((i * 3) % 60),
    });
  }

  const groups = [
    { partner: "screen", instances: screenReal },
    {
      partner: "clean",
      instances: [
        { a: "The back seat is nice and clean", aWord: "clean", b: "She rides as quiet as a dream", artist: "Laura Marling", song: "Sophia", year: 2011 },
        { a: "My shirt is starched, my hands are clean", aWord: "clean", b: "But I was paid in a dream", artist: "Bill Callahan", song: "Drover", year: 2011 },
        { a: "The country roads are wide and clean", aWord: "clean", b: "We rolled the windows in a dream", artist: "Jason Isbell", song: "Cover Me Up", year: 2013 },
        { a: "Lord, make my hands and conscience clean", aWord: "clean", b: "I sang my way out of the dream", artist: "Brandi Carlile", song: "The Joke", year: 2017 },
        { a: "Snow in February, road still clean", aWord: "clean", b: "I write to keep alive the dream", artist: "Lucinda Williams", song: "Ghosts of Highway 20", year: 2016 },
        { a: "A linen shirt, a kitchen clean", aWord: "clean", b: "She lived inside her sister's dream", artist: "Big Thief", song: "Mary", year: 2019 },
        { a: "The morning broke up wide and clean", aWord: "clean", b: "And nothing left but yesterday's dream", artist: "Aoife O'Donovan", song: "Magpie", year: 2016 },
        { a: "He swept the floor, the room was clean", aWord: "clean", b: "He fell asleep inside his dream", artist: "Phoebe Bridgers", song: "Funeral", year: 2017 },
        { a: "Tin cup rinsed, the river clean", aWord: "clean", b: "We bathed the ashes of the dream", artist: "Gillian Welch", song: "Look at Miss Ohio", year: 2003 },
        { a: "A second-hand white wedding clean", aWord: "clean", b: "Buried twice inside her dream", artist: "Joanna Newsom", song: "Have One on Me", year: 2010 },
        { a: "The afternoon was bright and clean", aWord: "clean", b: "I never told her about the dream", artist: "Andy Shauf", song: "The Magician", year: 2016 },
        { a: "Lord, my heart and house are clean", aWord: "clean", b: "But yours still haunts my dream", artist: "Iron & Wine", song: "Naked as We Came", year: 2004 },
      ],
    },
    {
      partner: "queen",
      instances: [
        { a: "And I'm in love with being queen", aWord: "queen", b: "We're bigger than we ever dreamed", artist: "Lorde", song: "Royals", year: 2013 },
        { a: "She was the prom-night Hollywood queen", aWord: "queen", b: "Held in her lap a paper dream", artist: "Lana Del Rey", song: "Carmen", year: 2012 },
        { a: "Plays the part of the suburb queen", aWord: "queen", b: "Lives inside a magazine dream", artist: "Father John Misty", song: "Pure Comedy", year: 2017 },
        { a: "There once was a freckled green queen", aWord: "queen", b: "Who promised what she didn't dream", artist: "Joanna Newsom", song: "Emily", year: 2006 },
        { a: "We crowned her in a kitchen, queen", aWord: "queen", b: "Of all the worst kinds of dream", artist: "Adrianne Lenker", song: "Crybaby Bridge", year: 2020 },
        { a: "Some say she walked off as a queen", aWord: "queen", b: "Some say she vanished in a dream", artist: "Lucinda Williams", song: "Drunken Angel", year: 1998 },
        { a: "Her mother told her: act the queen", aWord: "queen", b: "Don't fall asleep inside the dream", artist: "Laura Marling", song: "Master Hunter", year: 2013 },
        { a: "Fourteen and already half a queen", aWord: "queen", b: "She held her brother in a dream", artist: "Big Thief", song: "Capacity", year: 2017 },
        { a: "Carry the bouquet, walk like a queen", aWord: "queen", b: "Through every fold of a folded dream", artist: "Andrew Bird", song: "Pulaski at Night", year: 2013 },
      ],
    },
    {
      partner: "seem",
      instances: [
        { a: "But her favorite one, it seems", aWord: "seems", b: "Was sinking into your dreams", artist: "Townes Van Zandt", song: "Pancho and Lefty", year: 1972 },
        { a: "Closer than they sometimes seem", aWord: "seem", b: "Are the past and present dream", artist: "Sufjan Stevens", song: "Should Have Known Better", year: 2015 },
        { a: "Things are not always what they seem", aWord: "seem", b: "Said the man inside my dream", artist: "Leonard Cohen", song: "The Stranger Song", year: 1967 },
        { a: "The lights were not as bright as they seemed", aWord: "seemed", b: "Mid-July, my brother dreamed", artist: "Adrianne Lenker", song: "Indiana", year: 2018 },
        { a: "I see things as they ought to seem", aWord: "seem", b: "Half-awake inside the dream", artist: "Joanna Newsom", song: "Sapokanikan", year: 2015 },
        { a: "The fence-line longer than it seemed", aWord: "seemed", b: "We slept where my mother had dreamed", artist: "Iron & Wine", song: "House by the Sea", year: 2007 },
        { a: "The wind was colder than it seemed", aWord: "seemed", b: "She left a note inside a dream", artist: "Gillian Welch", song: "Caleb Meyer", year: 1998 },
      ],
    },
    {
      partner: "mean",
      instances: [
        { a: "I don't know what it's supposed to mean", aWord: "mean", b: "Standing at the edge of the dream", artist: "Leonard Cohen", song: "Famous Blue Raincoat", year: 1971 },
        { a: "What does it mean, what does it mean?", aWord: "mean", b: "I keep asking it inside the dream", artist: "Aimee Mann", song: "Save Me", year: 1999 },
        { a: "Words that don't quite catch the mean", aWord: "mean", b: "Of half-remembered childhood dreams", artist: "Vienna Teng", song: "City Hall", year: 2006 },
        { a: "He looked at me as if to mean", aWord: "mean", b: "There's nothing left but the dream", artist: "Mount Eerie", song: "Real Death", year: 2017 },
        { a: "Don't ask me what the lyrics mean", aWord: "mean", b: "They live one floor above the dream", artist: "Andy Shauf", song: "Quite Like You", year: 2016 },
      ],
    },
    {
      partner: "team",
      instances: [
        { a: "We were the bad-luck winning team", aWord: "team", b: "Trading bruises for a dream", artist: "Bruce Springsteen", song: "Glory Days", year: 1984 },
        { a: "Two against the world, the team", aWord: "team", b: "Held together by the dream", artist: "Jason Isbell", song: "If We Were Vampires", year: 2017 },
        { a: "She picked me from her grade-school team", aWord: "team", b: "Held my hand inside the dream", artist: "Sufjan Stevens", song: "John My Beloved", year: 2015 },
      ],
    },
    {
      partner: "between",
      instances: [
        { a: "We lived in the rooms in between", aWord: "between", b: "Between the waking and the dream", artist: "Leonard Cohen", song: "Hallelujah", year: 1984 },
        { a: "I see the wires running in between", aWord: "between", b: "Each separate strand of a dream", artist: "Joanna Newsom", song: "Time, As a Symptom", year: 2015 },
      ],
    },
    { partner: "ravine", instances: [
      { a: "We slept above the cold ravine", aWord: "ravine", b: "Below it ran a small black dream", artist: "Bill Callahan", song: "Riding for the Feeling", year: 2011 },
    ]},
    { partner: "routine", instances: [
      { a: "This orphanage we call a ghetto is quite a routine", aWord: "routine", b: "I'm fortunate you believe in a dream", artist: "Lauryn Hill", song: "To Zion", year: 1998 },
    ]},
    { partner: "kerosene", instances: [
      { a: "Your breath's as hard as kerosene", aWord: "kerosene", b: "You weren't your mama's only dream", artist: "Townes Van Zandt", song: "Pancho and Lefty", year: 1972 },
    ]},
  ];

  // Sort descending by count; ties → alphabetical
  groups.sort((x, y) => y.instances.length - x.instances.length || x.partner.localeCompare(y.partner));

  // Summary numbers
  const totalSongs = groups.reduce((s, g) => s + g.instances.length, 0);
  const writers = new Set();
  for (const g of groups) for (const inst of g.instances) writers.add(inst.artist);

  return {
    groups,
    summary: {
      partners: groups.length,
      songs: totalSongs,
      writers: writers.size,
    },
  };
})();

window.MOCK_STANZA = (inst) => [
  "Some prelude line drifting in",
  inst.a,
  inst.b,
  "Then it fades back to the room",
];

window.MOCK_HELPERS = (() => {
  const wordRe = (w) => new RegExp(`\\b${w}\\b`, "gi");
  const highlightSource = (line) =>
    line.replace(wordRe("dream"), `<span class="mark-source">$&</span>`)
        .replace(wordRe("dreams"), `<span class="mark-source">$&</span>`)
        .replace(wordRe("dreamed"), `<span class="mark-source">$&</span>`)
        .replace(wordRe("dreaming"), `<span class="mark-source">$&</span>`);
  const highlightPartner = (line, word) =>
    line.replace(wordRe(word), `<span class="mark-partner">$&</span>`);
  return { highlightSource, highlightPartner };
})();
