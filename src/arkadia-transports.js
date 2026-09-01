// arkadia-transports.js — Arkadia MUD transport lines (ships, coaches) in the
// universal arkmap-transports v1 format. Game-specific DATA layer; the format
// and tooling live in the universal core (src/transports.js).
// Source: community transport data (Delwing/arkadia crowd projects), normalized.
// Hand-written module — plain const + one-line export (build-demo.mjs contract).

const ARKADIA_TRANSPORTS = {
  "format": "arkmap-transports",
  "version": 1,
  "lines": [
    {
      "name": "Ard Skellig - Faroe - Rozrog",
      "board": [
        "wem",
        "kup bilet",
        "wsiadz na statek",
        "wlm"
      ],
      "exit": "zejdz ze statku",
      "legs": [
        {
          "from": 10313,
          "to": 23669,
          "time": 55,
          "label": "Faroe"
        },
        {
          "from": 23669,
          "to": 3280,
          "time": 86,
          "label": "Rozrog"
        },
        {
          "from": 3280,
          "to": 10313,
          "time": 29,
          "label": "Ard Skellig"
        }
      ]
    },
    {
      "name": "Ard Skellig - Hindarsfjall",
      "board": [
        "wem",
        "kup bilet",
        "wsiadz na statek",
        "wlm"
      ],
      "exit": "zejdz ze statku",
      "legs": [
        {
          "from": 10314,
          "to": 23678,
          "time": 25,
          "label": "Hindarsfjall"
        },
        {
          "from": 23678,
          "to": 10314,
          "time": 28,
          "label": "Ard Skellig"
        }
      ]
    },
    {
      "name": "Ard Skellig - Novigrad",
      "board": [
        "wem",
        "kup bilet",
        "wsiadz na statek",
        "wlm"
      ],
      "exit": "zejdz ze statku",
      "legs": [
        {
          "from": 10311,
          "to": 7907,
          "time": 63,
          "label": "Novigrad"
        },
        {
          "from": 7907,
          "to": 10311,
          "time": 56,
          "label": "Ard Skellig"
        }
      ]
    },
    {
      "name": "Ard Skellig - Spikeroog",
      "board": [
        "wem",
        "kup bilet",
        "wsiadz na statek",
        "wlm"
      ],
      "exit": "zejdz ze statku",
      "legs": [
        {
          "from": 10369,
          "to": 23685,
          "time": 29,
          "label": "Spikeroog"
        },
        {
          "from": 23685,
          "to": 10369,
          "time": 29,
          "label": "Ard Skellig"
        }
      ]
    },
    {
      "name": "Bialy Most - Hagge",
      "board": [
        "wem",
        "wsiadz do wozu",
        "wlm"
      ],
      "exit": "wyjscie",
      "legs": [
        {
          "from": 2188,
          "to": 1998,
          "time": 33,
          "label": "Rinde"
        },
        {
          "from": 1998,
          "to": 1896,
          "time": 35,
          "label": "Murivel"
        },
        {
          "from": 1896,
          "to": 9990,
          "time": 37,
          "label": "Hagge"
        },
        {
          "from": 9990,
          "to": 1896,
          "time": 39,
          "label": "Murivel"
        },
        {
          "from": 1896,
          "to": 1998,
          "time": 35,
          "label": "Rinde"
        },
        {
          "from": 1998,
          "to": 2188,
          "time": 33,
          "label": "Bialy Most"
        }
      ]
    },
    {
      "name": "Blaviken - Blekitna Wstega",
      "board": [
        "wem",
        "kup bilet",
        "wsiadz na statek",
        "wlm"
      ],
      "exit": "zejdz ze statku",
      "legs": [
        {
          "from": 4060,
          "to": 6428,
          "time": 174,
          "label": "Blekitna Wstega"
        },
        {
          "from": 6428,
          "to": 4060,
          "time": 174,
          "label": "Blaviken"
        }
      ]
    },
    {
      "name": "Blekitna Wstega - Kreutzhofen",
      "board": [
        "wem",
        "kup bilet",
        "wsiadz na statek",
        "wlm"
      ],
      "exit": "zejdz ze statku",
      "legs": [
        {
          "from": 6429,
          "to": 6621,
          "time": 43,
          "label": "Kraina Zgromadzenia"
        },
        {
          "from": 6621,
          "to": 7233,
          "time": 44,
          "label": "Nuln"
        },
        {
          "from": 7233,
          "to": 5207,
          "time": 43,
          "label": "Kreutzhofen"
        },
        {
          "from": 5207,
          "to": 7233,
          "time": 40,
          "label": "Nuln"
        },
        {
          "from": 7233,
          "to": 6621,
          "time": 40,
          "label": "Kraina Zgromadzenia"
        },
        {
          "from": 6621,
          "to": 6429,
          "time": 40,
          "label": "Blekitna Wstega"
        }
      ]
    },
    {
      "name": "Bretonia - Parravon",
      "board": [
        "wsiadz na statek"
      ],
      "exit": "zejdz ze statku",
      "legs": [
        {
          "from": 7732,
          "to": 7733,
          "time": 25,
          "label": "Parravon"
        },
        {
          "from": 7733,
          "to": 7732,
          "time": 25,
          "label": "Bretonia"
        }
      ]
    },
    {
      "name": "Carreras - Rivia - Scala",
      "board": [
        "wem",
        "wsiadz do powozu",
        "wlm"
      ],
      "exit": "wyjscie",
      "legs": [
        {
          "from": 860,
          "to": 680,
          "label": "Scala - zajazd"
        },
        {
          "from": 680,
          "to": 860,
          "label": "Scala - rogatki"
        },
        {
          "from": 860,
          "to": 994,
          "label": "Gosciniec Rivski"
        },
        {
          "from": 994,
          "to": 266,
          "label": "Przelecz"
        },
        {
          "from": 266,
          "to": 994,
          "label": "Gosciniec Rivski"
        },
        {
          "from": 994,
          "to": 860,
          "label": "Scala - rogatki"
        }
      ]
    },
    {
      "name": "Jouinard - Nuln",
      "board": [
        "wem",
        "wsiadz do dylizansu",
        "wlm"
      ],
      "exit": "wyjscie",
      "legs": [
        {
          "from": 7640,
          "to": 7550,
          "time": 42,
          "label": "Bogenhafen"
        },
        {
          "from": 7550,
          "to": 7458,
          "time": 27,
          "label": "Zajazd 'Pod Srebrnym Grotem'"
        },
        {
          "from": 7458,
          "to": 7332,
          "time": 37,
          "label": "Nuln"
        },
        {
          "from": 7332,
          "to": 7458,
          "time": 37,
          "label": "Zajazd 'Pod Srebrnym Grotem'"
        },
        {
          "from": 7458,
          "to": 7550,
          "time": 27,
          "label": "Bogenhafen"
        },
        {
          "from": 7550,
          "to": 7640,
          "time": 41,
          "label": "Jouinard"
        }
      ]
    },
    {
      "name": "Karak Varn - Blekitna Wstega",
      "board": [
        "wem",
        "kup bilet",
        "wsiadz na statek",
        "wlm"
      ],
      "exit": "zejdz ze statku",
      "legs": [
        {
          "from": 15409,
          "to": 6427,
          "time": 41,
          "label": "Blekitna Wstega"
        },
        {
          "from": 6427,
          "to": 15409,
          "time": 40,
          "label": "Karak Varn"
        }
      ]
    },
    {
      "name": "Kraina Zgromadzenia - Nuln",
      "board": [
        "wem",
        "wsiadz do dylizansu",
        "wlm"
      ],
      "exit": "wyjscie",
      "legs": [
        {
          "from": 6727,
          "to": 6571,
          "time": 19,
          "label": "Karczma 'Czarny Kon'"
        },
        {
          "from": 6571,
          "to": 6779,
          "time": 17,
          "label": "Blutdorf"
        },
        {
          "from": 6779,
          "to": 7256,
          "time": 27,
          "label": "Nuln"
        },
        {
          "from": 7256,
          "to": 6779,
          "time": 27,
          "label": "Blutdorf"
        },
        {
          "from": 6779,
          "to": 6571,
          "time": 17,
          "label": "Karczma 'Czarny Kon'"
        },
        {
          "from": 6571,
          "to": 6727,
          "time": 19,
          "label": "Kraina Zgromadzenia"
        }
      ]
    },
    {
      "name": "Kreutzhofen - Alimento",
      "board": [
        "wsiadz na statek"
      ],
      "exit": "zejdz ze statku",
      "legs": [
        {
          "from": 5206,
          "to": 5601,
          "time": 49,
          "label": "Alimento"
        },
        {
          "from": 5601,
          "to": 5206,
          "time": 68,
          "label": "Kreutzhofen"
        }
      ]
    },
    {
      "name": "Laki pod Quenelles - Zachod Quenelles",
      "board": [
        "wsiadz na statek"
      ],
      "exit": "zejdz ze statku",
      "legs": [
        {
          "from": 4841,
          "to": 4824,
          "time": 30,
          "label": "Zachod Quenelles"
        },
        {
          "from": 4824,
          "to": 4841,
          "time": 30,
          "label": "Laki pod Quenelles"
        }
      ]
    },
    {
      "name": "Maribor - Grabowa Buchta",
      "board": [
        "wem",
        "wsiadz do wozu",
        "wlm"
      ],
      "exit": "wyjscie",
      "legs": [
        {
          "from": 3525,
          "to": 3457,
          "time": 22,
          "label": "Kocie Pole"
        },
        {
          "from": 3457,
          "to": 3343,
          "time": 38,
          "label": "Zajazd u Marfa"
        },
        {
          "from": 3343,
          "to": 180,
          "time": 43,
          "label": "Maribor"
        },
        {
          "from": 180,
          "to": 3343,
          "time": 42,
          "label": "Zajazd u Marfa"
        },
        {
          "from": 3343,
          "to": 3457,
          "time": 38,
          "label": "Kocie Pole"
        },
        {
          "from": 3457,
          "to": 3525,
          "time": 21,
          "label": "Grabowa Buchta"
        }
      ]
    },
    {
      "name": "Maribor - Obawa",
      "board": [
        "wem",
        "wsiadz do powozu",
        "wlm"
      ],
      "exit": "wyjscie",
      "legs": [
        {
          "from": 180,
          "to": 536,
          "label": "Brugge"
        },
        {
          "from": 536,
          "to": 3043,
          "label": "Bialy Kiel"
        },
        {
          "from": 3043,
          "to": 3221,
          "label": "Obawa"
        },
        {
          "from": 3221,
          "to": 3043,
          "label": "Bialy Kiel"
        },
        {
          "from": 3043,
          "to": 536,
          "label": "Brugge"
        },
        {
          "from": 536,
          "to": 180,
          "label": "Maribor"
        }
      ]
    },
    {
      "name": "Mekan - Baccala",
      "board": [
        "wem",
        "kup bilet",
        "wsiadz na statek",
        "wlm"
      ],
      "exit": "zejdz ze statku",
      "legs": [
        {
          "from": 23792,
          "to": 9707,
          "time": 91,
          "label": "Baccala"
        },
        {
          "from": 9707,
          "to": 23792,
          "time": 95,
          "label": "Mekan"
        }
      ]
    },
    {
      "name": "Novigrad - Baccala",
      "board": [
        "wem",
        "kup bilet",
        "wsiadz na statek",
        "wlm"
      ],
      "exit": "zejdz ze statku",
      "legs": [
        {
          "from": 7910,
          "to": 3281,
          "time": 107,
          "label": "Rozrog"
        },
        {
          "from": 3281,
          "to": 9705,
          "time": 76,
          "label": "Baccala"
        },
        {
          "from": 9705,
          "to": 3281,
          "time": 76,
          "label": "Rozrog"
        },
        {
          "from": 3281,
          "to": 7910,
          "time": 107,
          "label": "Novigrad"
        }
      ]
    },
    {
      "name": "Novigrad - Blaviken - Daevon",
      "board": [
        "wem",
        "kup bilet",
        "wsiadz na statek",
        "wlm"
      ],
      "exit": "zejdz ze statku",
      "legs": [
        {
          "from": 2223,
          "to": 4061,
          "time": 45,
          "label": "Blaviken"
        },
        {
          "from": 4061,
          "to": 11690,
          "time": 42,
          "label": "Daevon"
        },
        {
          "from": 11690,
          "to": 4058,
          "time": 55,
          "label": "Blaviken"
        },
        {
          "from": 4058,
          "to": 2223,
          "time": 55,
          "label": "Novigrad"
        }
      ]
    },
    {
      "name": "Novigrad - Nadrzecze",
      "board": [
        "wsiadz na statek"
      ],
      "exit": "zejdz ze statku",
      "legs": [
        {
          "from": 7903,
          "to": 10486,
          "time": 30,
          "label": "Stocznia w Novigradzie"
        },
        {
          "from": 10486,
          "to": 3583,
          "time": 28,
          "label": "Nadrzecze"
        },
        {
          "from": 3583,
          "to": 10486,
          "time": 26,
          "label": "Stocznia w Novigradzie"
        },
        {
          "from": 10486,
          "to": 7903,
          "time": 26,
          "label": "Novigrad"
        }
      ]
    },
    {
      "name": "Novigrad - Oxenfurt",
      "board": [
        "wem",
        "wsiadz do powozu",
        "wlm"
      ],
      "exit": "wyjscie",
      "legs": [
        {
          "from": 829,
          "to": 804,
          "time": 20,
          "label": "Oxenfurt"
        },
        {
          "from": 804,
          "to": 829,
          "time": 20,
          "label": "Novigrad"
        }
      ]
    },
    {
      "name": "Novigrad - Oxenfurt - Bialy Most",
      "board": [
        "wem",
        "kup bilet",
        "wsiadz na statek",
        "wlm"
      ],
      "exit": "zejdz ze statku",
      "legs": [
        {
          "from": 7908,
          "to": 2467,
          "time": 40,
          "label": "Oxenfurt"
        },
        {
          "from": 2467,
          "to": 2212,
          "time": 40,
          "label": "Bialy Most"
        },
        {
          "from": 2212,
          "to": 7908,
          "time": 30,
          "label": "Novigrad"
        }
      ]
    },
    {
      "name": "Novigrad - Wyspa Milosci",
      "board": [
        "wem",
        "kup bilet",
        "wsiadz na statek",
        "wlm"
      ],
      "exit": "zejdz ze statku",
      "legs": [
        {
          "from": 7911,
          "to": 11153,
          "time": 91,
          "label": "Wyspa Milosci"
        },
        {
          "from": 11153,
          "to": 7911,
          "time": 86,
          "label": "Novigrad"
        }
      ]
    },
    {
      "name": "Nuln - Blekitna Wstega",
      "board": [
        "wem",
        "wsiadz do dylizansu",
        "wlm"
      ],
      "exit": "wyjscie",
      "legs": [
        {
          "from": 6879,
          "to": 7131,
          "time": 19,
          "label": "Tadrig"
        },
        {
          "from": 7131,
          "to": 7086,
          "time": 21,
          "label": "Heideck"
        },
        {
          "from": 7086,
          "to": 6520,
          "time": 14,
          "label": "Averheim"
        },
        {
          "from": 6520,
          "to": 6448,
          "time": 13,
          "label": "Podzamcze twierdzy Sigmarytow"
        },
        {
          "from": 6448,
          "to": 6430,
          "time": 13,
          "label": "Przystan na Blekitnej Wstedze"
        },
        {
          "from": 6430,
          "to": 6448,
          "time": 13,
          "label": "Podzamcze twierdzy Sigmarytow"
        },
        {
          "from": 6448,
          "to": 6520,
          "time": 13,
          "label": "Averheim"
        },
        {
          "from": 6520,
          "to": 7086,
          "time": 14,
          "label": "Heideck"
        },
        {
          "from": 7086,
          "to": 7131,
          "time": 21,
          "label": "Tadrig"
        },
        {
          "from": 7131,
          "to": 6879,
          "time": 19,
          "label": "Nuln"
        }
      ]
    },
    {
      "name": "Nuln - Bogenhafen",
      "board": [
        "wem",
        "kup bilet",
        "wsiadz na statek",
        "wlm"
      ],
      "exit": "zejdz ze statku",
      "legs": [
        {
          "from": 6891,
          "to": 7568,
          "time": 43,
          "label": "Bogenhafen"
        },
        {
          "from": 7568,
          "to": 6891,
          "time": 40,
          "label": "Nuln"
        }
      ]
    },
    {
      "name": "Obawa zach. - Novigrad - Obawa srod. - Scala",
      "board": [
        "wem",
        "kup bilet",
        "wsiadz na statek",
        "wlm"
      ],
      "exit": "zejdz ze statku",
      "legs": [
        {
          "from": 3247,
          "to": 7912,
          "time": 73,
          "label": "Novigrad"
        },
        {
          "from": 7912,
          "to": 3248,
          "time": 58,
          "label": "Obawa srod."
        },
        {
          "from": 3248,
          "to": 927,
          "time": 56,
          "label": "Scala"
        },
        {
          "from": 927,
          "to": 3247,
          "time": 77,
          "label": "Obawa zach."
        }
      ]
    },
    {
      "name": "Oxenfurt - Blaviken",
      "board": [
        "wem",
        "kup bilet",
        "wsiadz na statek",
        "wlm"
      ],
      "exit": "zejdz ze statku",
      "legs": [
        {
          "from": 2574,
          "to": 4059,
          "time": 55,
          "label": "Blaviken"
        },
        {
          "from": 4059,
          "to": 2574,
          "time": 55,
          "label": "Oxenfurt"
        }
      ]
    },
    {
      "name": "Oxenfurt - Grabowa Buchta",
      "board": [
        "wsiadz na statek"
      ],
      "exit": "zejdz ze statku",
      "legs": [
        {
          "from": 2464,
          "to": 3542,
          "time": 29,
          "label": "Grabowa Buchta"
        },
        {
          "from": 3542,
          "to": 2464,
          "time": 33,
          "label": "Oxenfurt"
        }
      ]
    },
    {
      "name": "Piana - Stare Buki",
      "board": [
        "wem",
        "kup bilet",
        "wsiadz na statek",
        "wlm"
      ],
      "exit": "zejdz ze statku",
      "legs": [
        {
          "from": 2616,
          "to": 10018,
          "time": 42,
          "label": "Hagge"
        },
        {
          "from": 10018,
          "to": 8087,
          "time": 42,
          "label": "Stare Buki"
        },
        {
          "from": 8087,
          "to": 10018,
          "time": 56,
          "label": "Hagge"
        },
        {
          "from": 10018,
          "to": 2616,
          "time": 63,
          "label": "Piana"
        }
      ]
    },
    {
      "name": "Podgrodzie Tretogoru - Gelibol",
      "board": [
        "wem",
        "wsiadz do wozu",
        "wlm"
      ],
      "exit": "wyjscie",
      "legs": [
        {
          "from": 3926,
          "to": 4092,
          "label": "Sucha Kepa"
        },
        {
          "from": 4092,
          "to": 4163,
          "label": "Gelibol"
        },
        {
          "from": 4163,
          "to": 4092,
          "label": "Sucha Kepa"
        },
        {
          "from": 4092,
          "to": 3926,
          "label": "Podgrodzie Tretogoru"
        }
      ]
    },
    {
      "name": "Poludniowy brzeg Pontaru - Polnocny brzeg Pontaru",
      "board": [
        "wsiadz na statek"
      ],
      "exit": "zejdz ze statku",
      "legs": [
        {
          "from": 2624,
          "to": 3442,
          "time": 25,
          "label": "Polnocny brzeg Pontaru"
        },
        {
          "from": 3442,
          "to": 2624,
          "time": 25,
          "label": "Poludniowy brzeg Pontaru"
        }
      ]
    },
    {
      "name": "Quenelles - Marguilles",
      "board": [
        "wem",
        "kup bilet",
        "wsiadz na statek",
        "wlm"
      ],
      "exit": "zejdz ze statku",
      "legs": [
        {
          "from": 4653,
          "to": 4890,
          "time": 33,
          "label": "Marguilles"
        },
        {
          "from": 4890,
          "to": 4653,
          "time": 29,
          "label": "Quenelles"
        }
      ]
    },
    {
      "name": "Quenelles - Obawa",
      "board": [
        "wem",
        "kup bilet",
        "wsiadz na statek",
        "wlm"
      ],
      "exit": "zejdz ze statku",
      "legs": [
        {
          "from": 4651,
          "to": 3251,
          "time": 179,
          "label": "Obawa"
        },
        {
          "from": 3251,
          "to": 4651,
          "time": 179,
          "label": "Quenelles"
        }
      ]
    },
    {
      "name": "Quenelles - Parravon",
      "board": [
        "wem",
        "wsiadz do dylizansu",
        "wlm"
      ],
      "exit": "wyjscie",
      "legs": [
        {
          "from": 4659,
          "to": 7786,
          "time": 44,
          "label": "Montlac"
        },
        {
          "from": 7786,
          "to": 7744,
          "time": 7,
          "label": "Merceaux-Descloux"
        },
        {
          "from": 7744,
          "to": 26659,
          "time": 7,
          "label": "Parravon"
        },
        {
          "from": 26659,
          "to": 7744,
          "time": 7,
          "label": "Merceaux-Descloux"
        },
        {
          "from": 7744,
          "to": 7786,
          "time": 16,
          "label": "Montlac"
        },
        {
          "from": 7786,
          "to": 4659,
          "time": 44,
          "label": "Quenelles"
        }
      ]
    },
    {
      "name": "Rozrog - Mekan",
      "board": [
        "wem",
        "kup bilet",
        "wsiadz na statek",
        "wlm"
      ],
      "exit": "zejdz ze statku",
      "legs": [
        {
          "from": 3273,
          "to": 23708,
          "time": 50,
          "label": "Mekan"
        },
        {
          "from": 23708,
          "to": 3273,
          "time": 46,
          "label": "Rozrog"
        }
      ]
    },
    {
      "name": "Salignac - Nuln",
      "board": [
        "wem",
        "wsiadz do dylizansu",
        "wlm"
      ],
      "exit": "wyjscie",
      "legs": [
        {
          "from": 4922,
          "to": 4985,
          "time": 11,
          "label": "'Pod piegowata elfka'"
        },
        {
          "from": 4985,
          "to": 5200,
          "time": 50,
          "label": "Kreutzhofen"
        },
        {
          "from": 5200,
          "to": 6903,
          "time": 49,
          "label": "Nuln"
        },
        {
          "from": 6903,
          "to": 5200,
          "time": 49,
          "label": "Kreutzhofen"
        },
        {
          "from": 5200,
          "to": 4985,
          "time": 53,
          "label": "'Pod piegowata elfka'"
        },
        {
          "from": 4985,
          "to": 4922,
          "time": 12,
          "label": "Salignac La Rouge"
        }
      ]
    },
    {
      "name": "Urbimo - Novigrad",
      "board": [
        "wem",
        "kup bilet",
        "wsiadz na statek",
        "wlm"
      ],
      "exit": "zejdz ze statku",
      "legs": [
        {
          "from": 5947,
          "to": 7909,
          "time": 199,
          "label": "Novigrad"
        },
        {
          "from": 7909,
          "to": 5947,
          "time": 199,
          "label": "Urbimo"
        }
      ]
    },
    {
      "name": "Urbimo - Toscania",
      "board": [
        "wem",
        "wsiadz do dylizansu",
        "wlm"
      ],
      "exit": "wyjscie",
      "legs": [
        {
          "from": 5887,
          "to": 5439,
          "time": 47,
          "label": "Incrocio alla Miragliano"
        },
        {
          "from": 5439,
          "to": 5373,
          "time": 14,
          "label": "Ebino"
        },
        {
          "from": 5373,
          "to": 5308,
          "time": 27,
          "label": "Toscania"
        },
        {
          "from": 5308,
          "to": 5373,
          "time": 28,
          "label": "Ebino"
        },
        {
          "from": 5373,
          "to": 5439,
          "time": 14,
          "label": "Incrocio alla Miragliano"
        },
        {
          "from": 5439,
          "to": 5887,
          "time": 47,
          "label": "Urbimo"
        }
      ]
    },
    {
      "name": "Urbimo - Wyspa Milosci",
      "board": [
        "wem",
        "kup bilet",
        "wsiadz na statek",
        "wlm"
      ],
      "exit": "zejdz ze statku",
      "legs": [
        {
          "from": 5946,
          "to": 11154,
          "time": 85,
          "label": "Wyspa Milosci"
        },
        {
          "from": 11154,
          "to": 5946,
          "time": 87,
          "label": "Urbimo"
        }
      ]
    },
    {
      "name": "Varieno - Miragliano - Campogrotta",
      "board": [
        "wem",
        "wsiadz do dylizansu",
        "wlm"
      ],
      "exit": "wyjscie",
      "legs": [
        {
          "from": 5468,
          "to": 5439,
          "time": 25,
          "label": "Miragliano"
        },
        {
          "from": 5439,
          "to": 5625,
          "time": 15,
          "label": "Viadaza"
        },
        {
          "from": 5625,
          "to": 5842,
          "time": 15,
          "label": "Urbimo"
        },
        {
          "from": 5842,
          "to": 5985,
          "time": 25,
          "label": "Varieno"
        },
        {
          "from": 5985,
          "to": 5842,
          "time": 25,
          "label": "Urbimo"
        },
        {
          "from": 5842,
          "to": 5625,
          "time": 15,
          "label": "Viadaza"
        },
        {
          "from": 5625,
          "to": 5439,
          "time": 15,
          "label": "Miragliano"
        },
        {
          "from": 5439,
          "to": 5468,
          "time": 25,
          "label": "Campogrotta"
        }
      ]
    },
    {
      "name": "Wyzima - Oxenfurt",
      "board": [
        "wem",
        "wsiadz do dylizansu",
        "wlm"
      ],
      "exit": "wyjscie",
      "legs": [
        {
          "from": 729,
          "to": 3760,
          "time": 19,
          "label": "Anchor"
        },
        {
          "from": 3760,
          "to": 746,
          "time": 23,
          "label": "Bialy Most"
        },
        {
          "from": 746,
          "to": 764,
          "time": 15,
          "label": "Piana"
        },
        {
          "from": 764,
          "to": 790,
          "time": 21,
          "label": "Podgrodzie Oxenfurtu"
        },
        {
          "from": 790,
          "to": 764,
          "time": 22,
          "label": "Piana"
        },
        {
          "from": 764,
          "to": 746,
          "time": 15,
          "label": "Bialy Most"
        },
        {
          "from": 746,
          "to": 3760,
          "time": 23,
          "label": "Anchor"
        },
        {
          "from": 3760,
          "to": 729,
          "time": 18,
          "label": "Wyzima"
        }
      ]
    }
  ]
};

export { ARKADIA_TRANSPORTS };
