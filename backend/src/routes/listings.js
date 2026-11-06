const router = require("express").Router();

router.use(require("./listings/notifications"));
router.use(require("./listings/sellerListings"));
router.use(require("./listings/adminListings"));

module.exports = router;
