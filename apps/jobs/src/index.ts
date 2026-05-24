import { registered } from "./registry.js";

console.log(`jobs worker booted; registered: ${registered().join(", ") || "none"}`);
