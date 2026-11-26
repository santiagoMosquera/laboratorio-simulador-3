import { handleMcp } from "../server/mcp.js";

export default {
  fetch(request) {
    return handleMcp(request);
  },
};
