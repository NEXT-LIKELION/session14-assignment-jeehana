const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();
const usersCollection = db.collection("users");

function containsKorean(text) {
  return /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(text);
}

function isValidEmail(email) {
  return typeof email === 'string' && email.includes("@");
}

//POST: 유저 추가
exports.createUser = onRequest((req, res) => {
  if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
  }

  const { name, email } = req.body;
  if (!name || !email) {
      return res.status(400).send({ error: "Missing name or email" });
  }

  if (containsKorean(name)) {
      return res.status(400).send({ error: "Name cannot contain Korean characters" });
  }

  if (!isValidEmail(email)) {
      return res.status(400).send({ error: "Invalid email format" });
  }

  usersCollection
  .add({
    name,
    email,
    createdAt: admin.firestore.FieldValue.serverTimestamp() // 🔸 이 줄 추가
  })
  .then((newUserRef) => {
    res.status(201).send({
      id: newUserRef.id,
      message: "User created",
    });
  })
  .catch((error) => {
    console.error(error);
    res.status(500).send({ error: error.message });
  });
});

// GET: 유저 이름으로 데이터 조회
exports.getUser = onRequest((req, res) => {
    if (req.method !== "GET") {
        return res.status(405).send("Method Not Allowed");
    }

    const userName = req.query.name;
    if (!userName) {
        return res.status(400).send({ error: "Missing user name in query" });
    }

    usersCollection
        .where("name", "==", userName)
        .limit(1)
        .get()
        .then((querySnapshot) => {
            if (querySnapshot.empty) {
                return res.status(404).send({ message: "User not found" });
            }

            const userDoc = querySnapshot.docs[0];
            res.status(200).send({ id: userDoc.id, ...userDoc.data() });
        })
        .catch((error) => {
            console.error(error);
            res.status(500).send({ error: error.message });
        });
});

// PUT: 유저 수정
exports.updateUser = onRequest((req, res) => {
  if (req.method !== "PUT") {
      return res.status(405).send("Method Not Allowed");
  }

  const userName = req.query.name;
  const updateFields = req.body;

  if (!userName || !updateFields) {
      return res
          .status(400)
          .send({ error: "Missing user name or update data" });
  }

  // 이메일 필드가 존재할 경우 형식 검사
  if ("email" in updateFields && !isValidEmail(updateFields.email)) {
      return res
          .status(400)
          .send({ error: "Invalid email format: missing @" });
  }

  usersCollection
      .where("name", "==", userName)
      .limit(1)
      .get()
      .then((querySnapshot) => {
          if (querySnapshot.empty) {
              return res.status(404).send({ message: "User not found" });
          }

          const userDoc = querySnapshot.docs[0];
          return userDoc.ref.update(updateFields);
      })
      .then(() => {
          res.status(200).send({ message: "User updated successfully" });
      })
      .catch((error) => {
          console.error(error);
          res.status(500).send({ error: error.message });
      });
});

function isOlderThanOneMinute(timestamp) {
  const now = new Date();
  const createdAt = timestamp.toDate(); // Firestore Timestamp → JS Date
  const diffMs = now - createdAt;
  return diffMs >= 60000; // 1분 = 60,000ms
}

// DELETE: 유저 삭제 (가입 후 1분 지난 경우만)
exports.deleteUser = onRequest((req, res) => {
  if (req.method !== "DELETE") {
      return res.status(405).send("Method Not Allowed");
  }

  const userName = req.query.name;
  if (!userName) {
      return res.status(400).send({ error: "Missing user name in query" });
  }

  usersCollection
      .where("name", "==", userName)
      .limit(1)
      .get()
      .then((querySnapshot) => {
          if (querySnapshot.empty) {
              return res.status(404).send({ message: "User not found" });
          }

          const userDoc = querySnapshot.docs[0];
          const data = userDoc.data();

          // createdAt이 없거나, 아직 1분 안 지난 경우
          if (!data.createdAt || !isOlderThanOneMinute(data.createdAt)) {
              return res.status(403).send({
                  error: "User cannot be deleted within 1 minute of creation"
              });
          }

          return userDoc.ref.delete();
      })
      .then(() => {
          res.status(200).send({ message: "User deleted successfully" });
      })
      .catch((error) => {
          console.error(error);
          res.status(500).send({ error: error.message });
      });
});
