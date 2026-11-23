import { createSageApi } from "./api.js";
import { createLocalTransport } from "./transport.js";

// Imported first by the entry, so `window.sage` exists before any view module runs.
window.sage = createSageApi(createLocalTransport(window.sageHost));
