// GENERADO por scripts/pet-pixellab/fetch-character.mjs — no editar a mano.
// Layout de cada spritesheet de public/pet/sheets/<stage>/<class>.png y acorn.png (spec sprites-personaje §5),
// más dos derivados del PNG: `hash` (sha1 corto; sheetSrc() lo pone en `?v=`, #1058) y `box` (caja real del
// personaje dentro de la celda, unión de todos los frames; zona táctil de la compañera, #1074).
export type PetAnimName = "idle" | "sleepy" | "sad" | "joy";
export type SheetRow = { row: number; frames: number };
export type SheetBox = { x: number; y: number; w: number; h: number };
export type SheetEntry = {
  cell: number;
  width: number;
  height: number;
  columns: number;
  directions: readonly string[];
  rotationsRow: number;
  anims: Record<PetAnimName, SheetRow>;
  hash: string;
  box: SheetBox;
};
export type AcornAnimName = "idle" | "ready";
export type AcornSheetEntry = { cell: number; width: number; height: number; columns: number; anims: Record<AcornAnimName, SheetRow>; hash: string; box: SheetBox };
export const PET_SHEETS = {
  "young": {
    "barbarian": {
      "cell": 92,
      "width": 828,
      "height": 460,
      "columns": 9,
      "directions": [
        "south",
        "south-east",
        "east",
        "north-east",
        "north",
        "north-west",
        "west",
        "south-west"
      ],
      "rotationsRow": 0,
      "anims": {
        "idle": {
          "row": 1,
          "frames": 9
        },
        "sleepy": {
          "row": 2,
          "frames": 9
        },
        "sad": {
          "row": 3,
          "frames": 9
        },
        "joy": {
          "row": 4,
          "frames": 9
        }
      },
      "hash": "998fdf6050",
      "box": {
        "x": 11,
        "y": 10,
        "w": 71,
        "h": 66
      }
    },
    "fighter": {
      "cell": 100,
      "width": 900,
      "height": 500,
      "columns": 9,
      "directions": [
        "south",
        "south-east",
        "east",
        "north-east",
        "north",
        "north-west",
        "west",
        "south-west"
      ],
      "rotationsRow": 0,
      "anims": {
        "idle": {
          "row": 1,
          "frames": 9
        },
        "sleepy": {
          "row": 3,
          "frames": 9
        },
        "sad": {
          "row": 2,
          "frames": 9
        },
        "joy": {
          "row": 4,
          "frames": 9
        }
      },
      "hash": "6a56d1c386",
      "box": {
        "x": 11,
        "y": 13,
        "w": 77,
        "h": 68
      }
    },
    "wizard": {
      "cell": 92,
      "width": 828,
      "height": 460,
      "columns": 9,
      "directions": [
        "south",
        "south-east",
        "east",
        "north-east",
        "north",
        "north-west",
        "west",
        "south-west"
      ],
      "rotationsRow": 0,
      "anims": {
        "idle": {
          "row": 1,
          "frames": 9
        },
        "sleepy": {
          "row": 2,
          "frames": 9
        },
        "sad": {
          "row": 4,
          "frames": 9
        },
        "joy": {
          "row": 3,
          "frames": 9
        }
      },
      "hash": "b747d14efb",
      "box": {
        "x": 11,
        "y": 10,
        "w": 72,
        "h": 67
      }
    },
    "cleric": {
      "cell": 96,
      "width": 864,
      "height": 480,
      "columns": 9,
      "directions": [
        "south",
        "south-east",
        "east",
        "north-east",
        "north",
        "north-west",
        "west",
        "south-west"
      ],
      "rotationsRow": 0,
      "anims": {
        "idle": {
          "row": 3,
          "frames": 9
        },
        "sleepy": {
          "row": 2,
          "frames": 9
        },
        "sad": {
          "row": 1,
          "frames": 9
        },
        "joy": {
          "row": 4,
          "frames": 9
        }
      },
      "hash": "5f1fb4f8da",
      "box": {
        "x": 12,
        "y": 12,
        "w": 74,
        "h": 66
      }
    },
    "bard": {
      "cell": 92,
      "width": 828,
      "height": 460,
      "columns": 9,
      "directions": [
        "south",
        "south-east",
        "east",
        "north-east",
        "north",
        "north-west",
        "west",
        "south-west"
      ],
      "rotationsRow": 0,
      "anims": {
        "idle": {
          "row": 4,
          "frames": 9
        },
        "sleepy": {
          "row": 2,
          "frames": 9
        },
        "sad": {
          "row": 1,
          "frames": 9
        },
        "joy": {
          "row": 3,
          "frames": 9
        }
      },
      "hash": "0854f0ebaf",
      "box": {
        "x": 12,
        "y": 12,
        "w": 71,
        "h": 66
      }
    },
    "ranger": {
      "cell": 92,
      "width": 828,
      "height": 460,
      "columns": 9,
      "directions": [
        "south",
        "south-east",
        "east",
        "north-east",
        "north",
        "north-west",
        "west",
        "south-west"
      ],
      "rotationsRow": 0,
      "anims": {
        "idle": {
          "row": 4,
          "frames": 9
        },
        "sleepy": {
          "row": 3,
          "frames": 9
        },
        "sad": {
          "row": 1,
          "frames": 9
        },
        "joy": {
          "row": 2,
          "frames": 9
        }
      },
      "hash": "a47de4a694",
      "box": {
        "x": 13,
        "y": 12,
        "w": 69,
        "h": 65
      }
    }
  },
  "adult": {
    "barbarian": {
      "cell": 104,
      "width": 936,
      "height": 520,
      "columns": 9,
      "directions": [
        "south",
        "south-east",
        "east",
        "north-east",
        "north",
        "north-west",
        "west",
        "south-west"
      ],
      "rotationsRow": 0,
      "anims": {
        "idle": {
          "row": 4,
          "frames": 9
        },
        "sleepy": {
          "row": 3,
          "frames": 9
        },
        "sad": {
          "row": 1,
          "frames": 9
        },
        "joy": {
          "row": 2,
          "frames": 9
        }
      },
      "hash": "586d4fbb00",
      "box": {
        "x": 12,
        "y": 17,
        "w": 80,
        "h": 66
      }
    },
    "fighter": {
      "cell": 100,
      "width": 900,
      "height": 500,
      "columns": 9,
      "directions": [
        "south",
        "south-east",
        "east",
        "north-east",
        "north",
        "north-west",
        "west",
        "south-west"
      ],
      "rotationsRow": 0,
      "anims": {
        "idle": {
          "row": 4,
          "frames": 9
        },
        "sleepy": {
          "row": 3,
          "frames": 9
        },
        "sad": {
          "row": 2,
          "frames": 9
        },
        "joy": {
          "row": 1,
          "frames": 9
        }
      },
      "hash": "9393e6a621",
      "box": {
        "x": 10,
        "y": 10,
        "w": 80,
        "h": 71
      }
    },
    "wizard": {
      "cell": 92,
      "width": 828,
      "height": 460,
      "columns": 9,
      "directions": [
        "south",
        "south-east",
        "east",
        "north-east",
        "north",
        "north-west",
        "west",
        "south-west"
      ],
      "rotationsRow": 0,
      "anims": {
        "idle": {
          "row": 3,
          "frames": 9
        },
        "sleepy": {
          "row": 4,
          "frames": 9
        },
        "sad": {
          "row": 2,
          "frames": 9
        },
        "joy": {
          "row": 1,
          "frames": 9
        }
      },
      "hash": "ba2b4957f8",
      "box": {
        "x": 12,
        "y": 11,
        "w": 67,
        "h": 65
      }
    },
    "cleric": {
      "cell": 104,
      "width": 936,
      "height": 520,
      "columns": 9,
      "directions": [
        "south",
        "south-east",
        "east",
        "north-east",
        "north",
        "north-west",
        "west",
        "south-west"
      ],
      "rotationsRow": 0,
      "anims": {
        "idle": {
          "row": 3,
          "frames": 9
        },
        "sleepy": {
          "row": 1,
          "frames": 9
        },
        "sad": {
          "row": 4,
          "frames": 9
        },
        "joy": {
          "row": 2,
          "frames": 9
        }
      },
      "hash": "93cc0ebfc2",
      "box": {
        "x": 13,
        "y": 12,
        "w": 76,
        "h": 74
      }
    },
    "bard": {
      "cell": 104,
      "width": 936,
      "height": 520,
      "columns": 9,
      "directions": [
        "south",
        "south-east",
        "east",
        "north-east",
        "north",
        "north-west",
        "west",
        "south-west"
      ],
      "rotationsRow": 0,
      "anims": {
        "idle": {
          "row": 4,
          "frames": 9
        },
        "sleepy": {
          "row": 3,
          "frames": 9
        },
        "sad": {
          "row": 2,
          "frames": 9
        },
        "joy": {
          "row": 1,
          "frames": 9
        }
      },
      "hash": "84f50f5f3b",
      "box": {
        "x": 18,
        "y": 13,
        "w": 71,
        "h": 69
      }
    },
    "ranger": {
      "cell": 92,
      "width": 828,
      "height": 460,
      "columns": 9,
      "directions": [
        "south",
        "south-east",
        "east",
        "north-east",
        "north",
        "north-west",
        "west",
        "south-west"
      ],
      "rotationsRow": 0,
      "anims": {
        "idle": {
          "row": 2,
          "frames": 9
        },
        "sleepy": {
          "row": 1,
          "frames": 9
        },
        "sad": {
          "row": 3,
          "frames": 9
        },
        "joy": {
          "row": 4,
          "frames": 9
        }
      },
      "hash": "fab0399743",
      "box": {
        "x": 14,
        "y": 12,
        "w": 66,
        "h": 65
      }
    }
  },
  "veteran": {
    "barbarian": {
      "cell": 104,
      "width": 936,
      "height": 520,
      "columns": 9,
      "directions": [
        "south",
        "south-east",
        "east",
        "north-east",
        "north",
        "north-west",
        "west",
        "south-west"
      ],
      "rotationsRow": 0,
      "anims": {
        "idle": {
          "row": 4,
          "frames": 9
        },
        "sleepy": {
          "row": 3,
          "frames": 9
        },
        "sad": {
          "row": 1,
          "frames": 9
        },
        "joy": {
          "row": 2,
          "frames": 9
        }
      },
      "hash": "d69b972d3e",
      "box": {
        "x": 14,
        "y": 12,
        "w": 78,
        "h": 74
      }
    },
    "fighter": {
      "cell": 100,
      "width": 900,
      "height": 500,
      "columns": 9,
      "directions": [
        "south",
        "south-east",
        "east",
        "north-east",
        "north",
        "north-west",
        "west",
        "south-west"
      ],
      "rotationsRow": 0,
      "anims": {
        "idle": {
          "row": 1,
          "frames": 9
        },
        "sleepy": {
          "row": 3,
          "frames": 9
        },
        "sad": {
          "row": 2,
          "frames": 9
        },
        "joy": {
          "row": 4,
          "frames": 9
        }
      },
      "hash": "5f8ac1c422",
      "box": {
        "x": 17,
        "y": 11,
        "w": 69,
        "h": 72
      }
    },
    "wizard": {
      "cell": 92,
      "width": 828,
      "height": 460,
      "columns": 9,
      "directions": [
        "south",
        "south-east",
        "east",
        "north-east",
        "north",
        "north-west",
        "west",
        "south-west"
      ],
      "rotationsRow": 0,
      "anims": {
        "idle": {
          "row": 4,
          "frames": 9
        },
        "sleepy": {
          "row": 2,
          "frames": 9
        },
        "sad": {
          "row": 3,
          "frames": 9
        },
        "joy": {
          "row": 1,
          "frames": 9
        }
      },
      "hash": "47cc947006",
      "box": {
        "x": 13,
        "y": 11,
        "w": 68,
        "h": 65
      }
    },
    "cleric": {
      "cell": 92,
      "width": 828,
      "height": 460,
      "columns": 9,
      "directions": [
        "south",
        "south-east",
        "east",
        "north-east",
        "north",
        "north-west",
        "west",
        "south-west"
      ],
      "rotationsRow": 0,
      "anims": {
        "idle": {
          "row": 2,
          "frames": 9
        },
        "sleepy": {
          "row": 4,
          "frames": 9
        },
        "sad": {
          "row": 3,
          "frames": 9
        },
        "joy": {
          "row": 1,
          "frames": 9
        }
      },
      "hash": "8bc5939742",
      "box": {
        "x": 12,
        "y": 9,
        "w": 70,
        "h": 66
      }
    },
    "bard": {
      "cell": 104,
      "width": 936,
      "height": 520,
      "columns": 9,
      "directions": [
        "south",
        "south-east",
        "east",
        "north-east",
        "north",
        "north-west",
        "west",
        "south-west"
      ],
      "rotationsRow": 0,
      "anims": {
        "idle": {
          "row": 4,
          "frames": 9
        },
        "sleepy": {
          "row": 1,
          "frames": 9
        },
        "sad": {
          "row": 3,
          "frames": 9
        },
        "joy": {
          "row": 2,
          "frames": 9
        }
      },
      "hash": "7d8de2762f",
      "box": {
        "x": 14,
        "y": 13,
        "w": 76,
        "h": 69
      }
    },
    "ranger": {
      "cell": 104,
      "width": 936,
      "height": 520,
      "columns": 9,
      "directions": [
        "south",
        "south-east",
        "east",
        "north-east",
        "north",
        "north-west",
        "west",
        "south-west"
      ],
      "rotationsRow": 0,
      "anims": {
        "idle": {
          "row": 2,
          "frames": 9
        },
        "sleepy": {
          "row": 1,
          "frames": 9
        },
        "sad": {
          "row": 3,
          "frames": 9
        },
        "joy": {
          "row": 4,
          "frames": 9
        }
      },
      "hash": "8304a3f7c5",
      "box": {
        "x": 21,
        "y": 11,
        "w": 64,
        "h": 72
      }
    }
  },
  "acorn": {
    "cell": 64,
    "width": 576,
    "height": 192,
    "columns": 9,
    "anims": {
      "idle": {
        "row": 1,
        "frames": 9
      },
      "ready": {
        "row": 2,
        "frames": 9
      }
    },
    "hash": "86bb93fb30",
    "box": {
      "x": 8,
      "y": 6,
      "w": 48,
      "h": 51
    }
  }
} as const satisfies Record<"young" | "adult" | "veteran", Record<string, SheetEntry>> & { acorn: AcornSheetEntry };
