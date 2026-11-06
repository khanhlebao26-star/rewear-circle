const router = require("express").Router();

router.use(require("./moderation/reports"));
router.use(require("./moderation/adminCases"));
router.use(require("./moderation/caseAssignment"));
router.use(require("./moderation/caseDecisions"));
router.use(require("./moderation/supportCases"));
router.use(require("./moderation/caseContact"));

module.exports = router;
