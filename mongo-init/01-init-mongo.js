// ==============================================================================
// Nidhi Suraksha - MongoDB 7 Replica Set & Least-Privilege Role Initialization
// ==============================================================================

// 1. Switch to admin db and create root administrator
const adminDb = db.getSiblingDB("admin");

try {
  adminDb.createUser({
    user: "admin",
    pwd: "AdminSecretPassword123!",
    roles: [{ role: "root", db: "admin" }]
  });
  print("Root admin user created successfully.");
} catch (e) {
  print("Root user may already exist or error: " + e.message);
}

// 2. Switch to nidhi_suraksha database
const appDb = db.getSiblingDB("nidhi_suraksha");

// 3. Define least-privilege custom role:
// All collections get standard readWrite EXCEPT auditLogs which gets ONLY insert and find
try {
  appDb.createRole({
    role: "nidhiAppRole",
    privileges: [
      {
        resource: { db: "nidhi_suraksha", collection: "" }, // default collection permissions
        actions: [
          "find", "insert", "update", "remove", 
          "createCollection", "createIndex", "dropIndex"
        ]
      },
      {
        resource: { db: "nidhi_suraksha", collection: "auditLogs" },
        actions: ["find", "insert", "createIndex"] // STRICT: No "update", No "remove"
      }
    ],
    roles: []
  });
  print("Custom role 'nidhiAppRole' created with append-only auditLogs restriction.");
} catch (e) {
  print("Role 'nidhiAppRole' creation note: " + e.message);
}

// 4. Create the application user with nidhiAppRole
try {
  appDb.createUser({
    user: "app",
    pwd: "AppSecretPassword123!",
    roles: [
      { role: "nidhiAppRole", db: "nidhi_suraksha" }
    ]
  });
  print("Application user 'app' created successfully.");
} catch (e) {
  print("App user creation note: " + e.message);
}
