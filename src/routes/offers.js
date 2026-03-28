import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { requireAdmin } from "../middleware/adminMiddleware.js";

import {
  createOffer,
  getOffer,
  getOffersByCandidate,
  updateOffer,
  respondToOffer,
  getAllOffers,
  handleOfferAction,
  getMyPendingOffers,
  assignNextStage,
  workflowMailAndAssign,
  deleteOffer,
  getAcceptedByMe,
  deleteOfferWorkflow,
  sendOfferLetter
} from "../controllers/offerController.js";

import multer from "multer";

const router = express.Router();
const upload = multer();

/* CREATE OFFER */
router.post("/", protect, requireAdmin, createOffer);

/* GET OFFERS */
router.get("/", protect, getAllOffers);
router.get("/candidate/:candidateId", protect, getOffersByCandidate);

/* MY WORKFLOW */
router.get("/my/pending", protect, getMyPendingOffers);
router.get("/my/accepted", protect, getAcceptedByMe);

/* DELETE WORKFLOW */
router.delete("/:id/workflow", protect, deleteOfferWorkflow);

/* ACTIONS */
router.get("/:id/action", handleOfferAction);
router.post("/:id/action", protect, handleOfferAction);

/* UPDATE */
router.put("/:id", protect, requireAdmin, updateOffer);

/* RESPOND */
router.get("/:id/respond", respondToOffer); // email link
router.post("/:id/respond", protect, respondToOffer); // existing workflow

/* WORKFLOW */
router.post("/:id/assign", protect, assignNextStage);

router.post(
  "/:id/workflow",
  protect,
  upload.single("offerFile"),
  workflowMailAndAssign
);

router.post(
  "/send-offer-letter",
  protect,
  upload.single("offerFile"),
  sendOfferLetter
);


/* DELETE */
router.delete("/:id", protect, requireAdmin, deleteOffer);

/* GET SINGLE */
router.get("/:id", protect, getOffer);

export default router;