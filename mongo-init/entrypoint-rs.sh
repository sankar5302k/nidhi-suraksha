#!/bin/bash
set -e

# Setup secure keyfile with strict POSIX permissions
cp /etc/mongo/mongo-keyfile /tmp/mongo-keyfile
chmod 400 /tmp/mongo-keyfile
chown mongodb:mongodb /tmp/mongo-keyfile

# Start mongod in background to initialize replica set if needed
mongod --replSet rs0 --keyFile /tmp/mongo-keyfile --bind_ip_all --fork --logpath /var/log/mongodb.log

# Wait for MongoDB to start
until mongosh --eval "db.adminCommand('ping')" > /dev/null 2>&1; do
  echo "Waiting for MongoDB startup..."
  sleep 1
done

# Initialize replica set if not already initialized
mongosh --eval "
  try {
    rs.status();
  } catch (err) {
    rs.initiate({
      _id: 'rs0',
      members: [{ _id: 0, host: '127.0.0.1:27017' }]
    });
  }
"

# Run initialization script for users & roles
mongosh /docker-entrypoint-initdb.d/01-init-mongo.js || true

# Shutdown background process
mongod --shutdown || true

# Hand over to foreground mongod process
exec mongod --replSet rs0 --keyFile /tmp/mongo-keyfile --auth --bind_ip_all
