const router = require("express").Router();

router.use(require("./commerce/discovery"));
router.use(require("./commerce/cartCheckout"));
router.use(require("./commerce/orders"));
router.use(require("./commerce/complaints"));
router.use(require("./commerce/cod"));

module.exports = router;
