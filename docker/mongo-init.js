const admin = db.getSiblingDB("admin");
const memberHost = process.env.REPLICA_MEMBER_HOST || "mongo:27017";
let current;
try {
  current = admin.runCommand({ replSetGetConfig: 1 });
} catch (error) {
  if (error.code !== 94) throw error;
  current = { ok: 0, code: 94 };
}

if (current.ok === 1) {
  const config = current.config;
  if (
    config._id !== "rs0" ||
    config.members.length !== 1 ||
    config.members[0].host !== memberHost
  ) {
    print("Replica set already exists with a different configuration; leaving it unchanged.");
    quit(1);
  }
} else if (current.code === 94) {
  const initialized = admin.runCommand({
    replSetInitiate: {
      _id: "rs0",
      members: [{ _id: 0, host: memberHost }],
    },
  });
  if (initialized.ok !== 1) {
    printjson(initialized);
    quit(1);
  }
} else {
  printjson(current);
  quit(1);
}

for (let attempt = 0; attempt < 60; attempt += 1) {
  if (db.hello().isWritablePrimary) {
    print(`Replica set rs0 is PRIMARY at ${memberHost}.`);
    quit(0);
  }
  sleep(1000);
}

print("Replica set did not become PRIMARY within 60 seconds.");
quit(1);
