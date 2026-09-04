// GENERADO por scripts/pet-pixellab/fetch-character.mjs — no editar a mano.
// Layout de cada spritesheet de public/pet/sheets/<stage>/<class>.png y acorn.png (spec sprites-personaje §5).
export type PetAnimName = "idle" | "sleepy" | "sad" | "joy";
export type SheetRow = { row: number; frames: number };
export type SheetEntry = {
  cell: number;
  width: number;
  height: number;
  columns: number;
  directions: readonly string[];
  rotationsRow: number;
  anims: Record<PetAnimName, SheetRow>;
};
export type AcornAnimName = "idle" | "ready";
export type AcornSheetEntry = { cell: number; width: number; height: number; columns: number; anims: Record<AcornAnimName, SheetRow> };
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
    }
  }
} as const satisfies Record<"young" | "adult" | "veteran", Record<string, SheetEntry>> & { acorn: AcornSheetEntry };
