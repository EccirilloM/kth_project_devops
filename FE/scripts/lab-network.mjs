import {readLab} from './lab-contract.ts';

// Keep CLI execution separate from the library loaded by Playwright.
// Only emit the validated network name, never credentials or the full manifest.
console.log(readLab().network);
