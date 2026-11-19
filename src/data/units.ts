/* Placeholder units for the M0 test map. Looks are Evolvlings creature sheets (Ninja Adventure, CC0). */
import type { UnitSpec } from "../engine/state";

export const TEST_UNITS: UnitSpec[] = [
  { id: "hero", name: "Hero", team: "heroes", element: "light", look: "lumo", pos: { x: 2, y: 6 }, hp: 40, ap: 6, mp: 3, speed: 50, jump: 1 },
  { id: "foe1", name: "Chisporro", team: "foes", element: "fire", look: "chisporro", pos: { x: 7, y: 1 }, hp: 30, ap: 6, mp: 3, speed: 40, jump: 1 },
  { id: "foe2", name: "Cañín", team: "foes", element: "plant", look: "canin", pos: { x: 8, y: 6 }, hp: 30, ap: 6, mp: 3, speed: 35, jump: 1 },
  { id: "foe3", name: "Ajolín", team: "foes", element: "water", look: "ajolin", pos: { x: 6, y: 8 }, hp: 30, ap: 6, mp: 4, speed: 45, jump: 1 },
];
