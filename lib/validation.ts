import { z } from "zod";

// Avoid dynamic Function compilation/probing in browsers with a strict CSP.
z.config({ jitless: true });
export { z };
