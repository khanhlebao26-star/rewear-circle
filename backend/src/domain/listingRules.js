const mongoose = require("mongoose");

function readForm(body = {}) {
  const sizes = {
    Áo: ["XS", "S", "M", "L", "XL", "XXL"],
    Quần: ["XS", "S", "M", "L", "XL", "XXL"],
    Giày: Array.from({ length: 11 }, (_, i) => String(i + 35)),
    "Phụ kiện": ["FREE_SIZE"],
  };

  const form = {
    title: String(body.title || "").trim(),
    category: String(body.category || "").trim(),
    size: String(body.size || "").trim(),
    condition: String(body.condition || "").trim(),
    description: String(body.description || "").trim(),
    flaws: String(body.flaws || "").trim(),
    price: body.price,
    shipFrom: String(body.shipFrom || "").trim(),
    imageIds: body.imageIds,
  };

  if (
    form.title.length < 5 ||
    form.title.length > 100 ||
    !sizes[form.category]?.includes(form.size) ||
    !form.condition ||
    form.condition.length > 40 ||
    form.description.length < 20 ||
    form.description.length > 2000 ||
    form.flaws.length > 1000 ||
    !Number.isInteger(form.price) ||
    form.price < 20000 ||
    form.price > 5000000 ||
    !form.shipFrom ||
    form.shipFrom.length > 100 ||
    !Array.isArray(form.imageIds) ||
    form.imageIds.length < 1 ||
    form.imageIds.length > 5 ||
    new Set(form.imageIds).size !== form.imageIds.length ||
    !form.imageIds.every((id) => mongoose.isValidObjectId(id))
  ) {
    return null;
  }

  return form;
}

module.exports = { readForm };
