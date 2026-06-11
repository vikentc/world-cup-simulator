// Statically compiled group drawing and schedules from groupstage.xlsx

export const GROUPSTAGE_GROUPS: Record<string, string[]> = {
  "A": [
    "CZE",
    "KOR",
    "MEX",
    "RSA"
  ],
  "B": [
    "BIH",
    "CAN",
    "QAT",
    "SUI"
  ],
  "C": [
    "BRA",
    "HTI",
    "MAR",
    "SCO"
  ],
  "D": [
    "AUS",
    "PAR",
    "TUR",
    "USA"
  ],
  "E": [
    "CIV",
    "CUW",
    "ECU",
    "GER"
  ],
  "F": [
    "JPN",
    "NED",
    "SWE",
    "TUN"
  ],
  "G": [
    "BEL",
    "EGY",
    "IRN",
    "NZL"
  ],
  "H": [
    "CPV",
    "ESP",
    "KSA",
    "URU"
  ],
  "I": [
    "FRA",
    "IRQ",
    "NOR",
    "SEN"
  ],
  "J": [
    "ALG",
    "ARG",
    "AUT",
    "JOR"
  ],
  "K": [
    "COD",
    "COL",
    "POR",
    "UZB"
  ],
  "L": [
    "CRO",
    "ENG",
    "GHA",
    "PAN"
  ]
};

export const GROUPSTAGE_SCHEDULE: { group: string; round: number; home: string; away: string }[] = [
  {
    "group": "A",
    "round": 1,
    "home": "MEX",
    "away": "RSA"
  },
  {
    "group": "A",
    "round": 2,
    "home": "CZE",
    "away": "RSA"
  },
  {
    "group": "A",
    "round": 3,
    "home": "RSA",
    "away": "KOR"
  },
  {
    "group": "A",
    "round": 1,
    "home": "KOR",
    "away": "CZE"
  },
  {
    "group": "A",
    "round": 2,
    "home": "MEX",
    "away": "KOR"
  },
  {
    "group": "A",
    "round": 3,
    "home": "CZE",
    "away": "MEX"
  },
  {
    "group": "B",
    "round": 1,
    "home": "CAN",
    "away": "BIH"
  },
  {
    "group": "B",
    "round": 2,
    "home": "SUI",
    "away": "BIH"
  },
  {
    "group": "B",
    "round": 3,
    "home": "SUI",
    "away": "CAN"
  },
  {
    "group": "B",
    "round": 1,
    "home": "QAT",
    "away": "SUI"
  },
  {
    "group": "B",
    "round": 2,
    "home": "CAN",
    "away": "QAT"
  },
  {
    "group": "B",
    "round": 3,
    "home": "BIH",
    "away": "QAT"
  },
  {
    "group": "C",
    "round": 1,
    "home": "BRA",
    "away": "MAR"
  },
  {
    "group": "C",
    "round": 2,
    "home": "SCO",
    "away": "MAR"
  },
  {
    "group": "C",
    "round": 3,
    "home": "MAR",
    "away": "HTI"
  },
  {
    "group": "C",
    "round": 1,
    "home": "HTI",
    "away": "SCO"
  },
  {
    "group": "C",
    "round": 2,
    "home": "BRA",
    "away": "HTI"
  },
  {
    "group": "C",
    "round": 3,
    "home": "SCO",
    "away": "BRA"
  },
  {
    "group": "D",
    "round": 1,
    "home": "USA",
    "away": "PAR"
  },
  {
    "group": "D",
    "round": 2,
    "home": "USA",
    "away": "AUS"
  },
  {
    "group": "D",
    "round": 3,
    "home": "PAR",
    "away": "AUS"
  },
  {
    "group": "D",
    "round": 1,
    "home": "AUS",
    "away": "TUR"
  },
  {
    "group": "D",
    "round": 2,
    "home": "TUR",
    "away": "PAR"
  },
  {
    "group": "D",
    "round": 3,
    "home": "TUR",
    "away": "USA"
  },
  {
    "group": "E",
    "round": 1,
    "home": "CIV",
    "away": "ECU"
  },
  {
    "group": "E",
    "round": 2,
    "home": "ECU",
    "away": "CUW"
  },
  {
    "group": "E",
    "round": 3,
    "home": "CUW",
    "away": "CIV"
  },
  {
    "group": "E",
    "round": 1,
    "home": "GER",
    "away": "CUW"
  },
  {
    "group": "F",
    "round": 2,
    "home": "NED",
    "away": "SWE"
  },
  {
    "group": "E",
    "round": 3,
    "home": "ECU",
    "away": "GER"
  },
  {
    "group": "F",
    "round": 1,
    "home": "NED",
    "away": "JPN"
  },
  {
    "group": "E",
    "round": 2,
    "home": "GER",
    "away": "CIV"
  },
  {
    "group": "F",
    "round": 3,
    "home": "TUN",
    "away": "NED"
  },
  {
    "group": "F",
    "round": 1,
    "home": "SWE",
    "away": "TUN"
  },
  {
    "group": "F",
    "round": 2,
    "home": "TUN",
    "away": "JPN"
  },
  {
    "group": "F",
    "round": 3,
    "home": "JPN",
    "away": "SWE"
  },
  {
    "group": "G",
    "round": 1,
    "home": "IRN",
    "away": "NZL"
  },
  {
    "group": "G",
    "round": 2,
    "home": "BEL",
    "away": "IRN"
  },
  {
    "group": "G",
    "round": 3,
    "home": "EGY",
    "away": "IRN"
  },
  {
    "group": "G",
    "round": 1,
    "home": "BEL",
    "away": "EGY"
  },
  {
    "group": "G",
    "round": 2,
    "home": "NZL",
    "away": "EGY"
  },
  {
    "group": "G",
    "round": 3,
    "home": "NZL",
    "away": "BEL"
  },
  {
    "group": "H",
    "round": 1,
    "home": "KSA",
    "away": "URU"
  },
  {
    "group": "H",
    "round": 2,
    "home": "ESP",
    "away": "KSA"
  },
  {
    "group": "H",
    "round": 3,
    "home": "CPV",
    "away": "KSA"
  },
  {
    "group": "H",
    "round": 1,
    "home": "ESP",
    "away": "CPV"
  },
  {
    "group": "H",
    "round": 2,
    "home": "URU",
    "away": "CPV"
  },
  {
    "group": "H",
    "round": 3,
    "home": "URU",
    "away": "ESP"
  },
  {
    "group": "I",
    "round": 1,
    "home": "FRA",
    "away": "SEN"
  },
  {
    "group": "I",
    "round": 2,
    "home": "FRA",
    "away": "IRQ"
  },
  {
    "group": "I",
    "round": 3,
    "home": "NOR",
    "away": "FRA"
  },
  {
    "group": "I",
    "round": 1,
    "home": "IRQ",
    "away": "NOR"
  },
  {
    "group": "I",
    "round": 2,
    "home": "NOR",
    "away": "SEN"
  },
  {
    "group": "I",
    "round": 3,
    "home": "SEN",
    "away": "IRQ"
  },
  {
    "group": "J",
    "round": 1,
    "home": "ARG",
    "away": "ALG"
  },
  {
    "group": "J",
    "round": 2,
    "home": "ARG",
    "away": "AUT"
  },
  {
    "group": "J",
    "round": 3,
    "home": "ALG",
    "away": "AUT"
  },
  {
    "group": "J",
    "round": 1,
    "home": "AUT",
    "away": "JOR"
  },
  {
    "group": "J",
    "round": 2,
    "home": "JOR",
    "away": "ALG"
  },
  {
    "group": "J",
    "round": 3,
    "home": "JOR",
    "away": "ARG"
  },
  {
    "group": "K",
    "round": 1,
    "home": "POR",
    "away": "COD"
  },
  {
    "group": "K",
    "round": 2,
    "home": "POR",
    "away": "UZB"
  },
  {
    "group": "K",
    "round": 3,
    "home": "COL",
    "away": "POR"
  },
  {
    "group": "K",
    "round": 1,
    "home": "UZB",
    "away": "COL"
  },
  {
    "group": "K",
    "round": 2,
    "home": "COL",
    "away": "COD"
  },
  {
    "group": "K",
    "round": 3,
    "home": "COD",
    "away": "UZB"
  },
  {
    "group": "L",
    "round": 1,
    "home": "GHA",
    "away": "PAN"
  },
  {
    "group": "L",
    "round": 2,
    "home": "ENG",
    "away": "GHA"
  },
  {
    "group": "L",
    "round": 3,
    "home": "PAN",
    "away": "ENG"
  },
  {
    "group": "L",
    "round": 1,
    "home": "ENG",
    "away": "CRO"
  },
  {
    "group": "L",
    "round": 2,
    "home": "PAN",
    "away": "CRO"
  },
  {
    "group": "L",
    "round": 3,
    "home": "CRO",
    "away": "GHA"
  }
];
