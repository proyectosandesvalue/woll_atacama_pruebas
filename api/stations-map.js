import { handleStationsMap } from "../server/handlers/stations.js";
import { respondWithHandler } from "../server/http/vercel-adapter.js";

export default function handler(req, res) {
  return respondWithHandler(req, res, handleStationsMap);
}
