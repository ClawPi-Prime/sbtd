"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DAMAGE_TABLE = void 0;
exports.DAMAGE_TABLE = {
    normal: { light: 1.0, medium: 0.75, heavy: 0.5, arcane: 0.7, unarmored: 1.0, structure: 0.5 },
    pierce: { light: 1.5, medium: 0.75, heavy: 0.5, arcane: 0.5, unarmored: 1.0, structure: 0.7 },
    magic: { light: 1.0, medium: 1.25, heavy: 1.0, arcane: 2.0, unarmored: 1.0, structure: 0.5 },
    siege: { light: 0.5, medium: 0.5, heavy: 1.25, arcane: 0.5, unarmored: 0.75, structure: 2.0 },
    chaos: { light: 1.0, medium: 1.0, heavy: 1.0, arcane: 1.0, unarmored: 1.0, structure: 1.0 },
};
