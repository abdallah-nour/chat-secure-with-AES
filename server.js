const path = require("path");
const mongoose = require("mongoose");
const http = require("http");
const express = require("express");
const socketio = require("socket.io");
const formatMessage = require("./utils/messages");
const Cryptr = require("cryptr");
const Room = require("./RoomSchema");
const bcrypt = require("bcrypt");
var bodyParser = require("body-parser");
require('dotenv').config()

const [SECRET_KEY, MONGO_URI] = [process.env.SECRET_KEY, process.env.MONGO_URI];

if (!SECRET_KEY || !MONGO_URI) throw new Error("Must have .env, with SECRET_KEY entry");
const cryptr = new Cryptr(
  SECRET_KEY,
);

mongoose.connect(MONGO_URI, {
  useUnifiedTopology: true, useNewUrlParser: true, useCreateIndex: true
});


const {
  userJoin,
  getCurrentUser,
  userLeave,
  getRoomUsers,
} = require("./utils/users");

const app = express();
const server = http.createServer(app);
const io = socketio(server);

app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.json());

app.use(bodyParser.urlencoded({ extended: true }));
const botName = "Admin";

io.on("connection", (socket) => {
  socket.on("joinRoom", ({ username, room }) => {
    const user = userJoin(socket.id, username, room);

    socket.join(user.room);

    socket.emit(
      "message",
      formatMessage(botName, cryptr.encrypt("Welcome To Chatbox"))
    );

    socket.broadcast
      .to(user.room)
      .emit(
        "message",
        formatMessage(
          botName,
          cryptr.encrypt(`${user.username} has entered the chat room`)
        )
      );

    io.to(user.room).emit("roomUsers", {
      room: user.room,
      users: getRoomUsers(user.room),
    });
  });

  socket.on("chatMessage", (msg) => {
    const user = getCurrentUser(socket.id);

    io.to(user.room).emit("message", formatMessage(user.username, msg));
  });

  socket.on("disconnect", () => {
    const user = userLeave(socket.id);

    if (user) {
      io.to(user.room).emit(
        "message",
        formatMessage(
          botName,
          cryptr.encrypt(`${user.username} has left the chat`)
        )
      );

      io.to(user.room).emit("roomUsers", {
        room: user.room,
        users: getRoomUsers(user.room),
      });
    }
  });
});

// ROUTES

app.get("/decrypt", (req, res) => {
  message = req.query.message;
  decrypted = cryptr.decrypt(message);
  res.json(decrypted);
});

app.get("/encrypt", (req, res) => {
  message = req.query.message;
  encrypted = cryptr.encrypt(message);
  res.json(encrypted);
});

app.post("/validate", (req, res) => {
  username = req.body["username"];
  roomName = req.body["room"];
  key = req.body.key;
  Room.findOne({ name: roomName }, async (err, room) => {
    if (room === null) {
      return res.redirect("wrong-password.html"); // User not Found
    }

    try {
      if (await bcrypt.compare(key, room.secretKey)) {
        rn = room.name;
        usern = username;
        url = "chat.html?room=" + rn + "&username=" + usern + "&sk=" + room._id;
        res.redirect(url);
      } else res.redirect("wrong-password.html");
    } catch {
      res.redirect("wrong-password.html");
    }
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));