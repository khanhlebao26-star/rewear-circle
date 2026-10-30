function orderItemDTO(item) {
  return {
    orderItemId: String(item._id || item.orderItemId),
    listingId: String(item.listingId),
    versionId: String(item.versionId),
    sellerId: String(item.sellerId),
    title: item.title,
    category: item.category,
    size: item.size,
    condition: item.condition,
    description: item.description,
    flaws: item.flaws,
    price: item.price,
    quantity: item.quantity,
    shipFrom: item.shipFrom,
    imageIds: (item.imageIds || []).map(String),
  };
}

module.exports = { orderItemDTO };
