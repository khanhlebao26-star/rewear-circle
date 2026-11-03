function orderWrite(order, filter, update) {
  const hasVersion = Number.isInteger(order.__v);
  const versionFilter = hasVersion
    ? { __v: order.__v }
    : { $or: [{ __v: { $exists: false } }, { __v: null }] };
  const versionUpdate = hasVersion
    ? { $inc: { ...(update.$inc || {}), __v: 1 } }
    : { $set: { ...(update.$set || {}), __v: 1 } };

  return {
    filter: { $and: [filter, versionFilter] },
    update: {
      ...update,
      ...(versionUpdate.$inc ? { $inc: versionUpdate.$inc } : {}),
      ...(versionUpdate.$set ? { $set: versionUpdate.$set } : {}),
    },
  };
}

module.exports = { orderWrite };
