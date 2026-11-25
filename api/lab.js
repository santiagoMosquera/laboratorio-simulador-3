import { handle } from "../server/lab.js";

export default {
  fetch(request) {
    return handle(request);
  },
};
