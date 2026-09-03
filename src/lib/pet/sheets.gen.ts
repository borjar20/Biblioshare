// GENERADO por scripts/pet-pixellab/fetch-character.mjs — no editar a mano.
// Layout de cada spritesheet de public/pet/sheets/<stage>/<class>.png (spec sprites-personaje §5).
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
export const PET_SHEETS = {
  "young": {
    "barbarian": {
      "cell": 52,
      "width": 468,
      "height": 260,
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
          "frames": 4
        },
        "sleepy": {
          "row": 3,
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
    "fighter": {
      "cell": 56,
      "width": 504,
      "height": 280,
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
          "frames": 4
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
    "wizard": {
      "cell": 56,
      "width": 504,
      "height": 280,
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
          "frames": 4
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
      "cell": 52,
      "width": 468,
      "height": 260,
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
          "frames": 4
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
    "bard": {
      "cell": 52,
      "width": 468,
      "height": 260,
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
          "frames": 4
        },
        "sleepy": {
          "row": 4,
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
      "cell": 52,
      "width": 468,
      "height": 260,
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
          "frames": 4
        },
        "sleepy": {
          "row": 1,
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
    }
  },
  "adult": {
    "barbarian": {
      "cell": 52,
      "width": 468,
      "height": 260,
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
          "frames": 4
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
    "fighter": {
      "cell": 56,
      "width": 504,
      "height": 280,
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
          "frames": 4
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
    "wizard": {
      "cell": 56,
      "width": 504,
      "height": 280,
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
          "frames": 4
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
    "cleric": {
      "cell": 52,
      "width": 468,
      "height": 260,
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
          "frames": 4
        },
        "sleepy": {
          "row": 1,
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
    "bard": {
      "cell": 56,
      "width": 504,
      "height": 280,
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
          "frames": 4
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
    "ranger": {
      "cell": 52,
      "width": 468,
      "height": 260,
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
          "frames": 4
        },
        "sleepy": {
          "row": 4,
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
  "veteran": {
    "barbarian": {
      "cell": 56,
      "width": 504,
      "height": 280,
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
          "frames": 4
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
          "row": 3,
          "frames": 9
        }
      }
    },
    "fighter": {
      "cell": 56,
      "width": 504,
      "height": 280,
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
          "frames": 4
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
      "cell": 56,
      "width": 504,
      "height": 280,
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
          "frames": 4
        },
        "sleepy": {
          "row": 4,
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
    "cleric": {
      "cell": 56,
      "width": 504,
      "height": 280,
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
          "frames": 4
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
          "row": 1,
          "frames": 9
        }
      }
    },
    "bard": {
      "cell": 56,
      "width": 504,
      "height": 280,
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
          "frames": 4
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
    "ranger": {
      "cell": 56,
      "width": 504,
      "height": 280,
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
          "frames": 4
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
    }
  }
} as const satisfies Record<"young" | "adult" | "veteran", Record<string, SheetEntry>>;
