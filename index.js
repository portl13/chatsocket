const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const {Server} = require('socket.io');
const io = new Server(server, {cors: {origin: '*', } });
const { joinUser, removeUser, getUsers, getUser } = require('./users');
const DBUrl = process.env.dbUri;
const cors = require('cors');
const config = require("./config.js");
const session = require('express-session');

// Models
const {Rooms} = require('./models/rooms');
const {Chatstate} = require('./models/chatstate');
const {Chatlog} = require('./models/chatlog');

const sessionMiddleware = session({
  secret: "somecrazystring",
  resave: false,
  saveUninitialized: false
});

app.use(sessionMiddleware);

/////////////////////////
// CONNECT TO MONGO DB //
/////////////////////////
var mongoose = require('mongoose');
mongoose.Promise = global.Promise;
mongoose.connect( process.env.dbUri, { 
    useUnifiedTopology: true, 
    useNewUrlParser: true 
}).catch(function(err) {
    console.log(err)
});
//mongoose.set('useCreateIndex', true);


app.get('/', (req, res) => {
  return res.sendFile(__dirname + '/index.html');
});

app.get('/chat/:room', (req, res) => {
  return res.sendFile(__dirname + '/index.html');
});

const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);

function emitHistory(socket_id, roomname){
  // Get the last messages up to 40.
  // emit those into the chat
  Chatlog.find({room: roomname, deleted: { $ne: true }})
  .sort({ _id: 1 }) 
  .limit(40)
  .exec((err, messages) => {

    if( err ) return;

    if( messages ){
      
      let _messages = messages.map(message => {
        let msgObject = message.toObject(); // Convert to plain JS object
        msgObject.msgId = msgObject._id;
        delete msgObject._id; // Remove the _id field
        return msgObject;
      });

      io.to(socket_id).emit("history", {
        type: '',
        history: _messages
      });
    }
  });
}

io.use(wrap(sessionMiddleware));

// this should expose the current socket session
io.use((socket, next) => {
  next();
});

io.on('connection', (socket) => {

  console.log('socket: connected');

  // JOIN CHAT ROOM
  socket.on("join", async (data) => {

    data.username = data.username.toLowerCase();

    console.log(`${data.username} join with the socket id of ${socket.id}`);

    Rooms.findOne({name: data.roomname}, (err, room) => {

      if(err) return;
      
      // There is a room defined
      if( room ){

        // Check if is the broadcaster
        socket.request.session.isBroadcaster = false;
        if( room.broadcaster && data.user_id )
        if( room.broadcaster == data.user_id ){
          socket.request.session.isBroadcaster = true;
        }
        // Check if is the moderator
        socket.request.session.isMod = false;
        if( room.mods.indexOf(data.username) > -1 ){
          socket.request.session.isMod = true;
        }

        if( parseInt(data.user_id) == parseInt(data.owner) ){
          socket.request.session.isMod = true;
          console.log(`${data.username} is now a moderator`);
        }
        // Check if is banned
        socket.request.session.isBanned = false;
        if( room.bans.indexOf(data.username) > -1 ){
          socket.request.session.isBanned = true;
          // Handle immediately if user is banned from chat
          io.to(socket.id).emit("MEMO", {
              type: 'ban',
              message: ''
          });
        }
                
        
        // Join the chat
        socket.join(data.roomname);    

        io.to(socket.id).emit('room-joined', `You have joined the room ${data.roomname}`)

        // We need to find the user in Chatstate and get the current socket id
        // to send them any MEMO's if necessary such as a Ban State
        Chatstate.findOne({room: data.roomname, user: data.username}, (err, chatstate) => {

          if(err) return;

          if( chatstate ){

            switch(chatstate.state){

              case 'timeout':
                if( chatstate.timetill > Date.now() ) {
                  var secondsleft = chatstate.timetill - Date.now();
                  io.to(socket.id).emit("NOTICE", {
                    image : false,
                    message: `You are currently in a timeout for ${secondsleft} remaining seconds.`,
                    type: 'timeout'
                  });
                  return;
                }
              break;

              case 'ban':
                chatstate.socketId = socket.id;
                chatstate.state = 'ban';
                chatstate.save();
              break;

              default:
                chatstate.state = 'active';
                chatstate.timetill = 0;
                chatstate.socketId = socket.id;
                chatstate.save();

                emitHistory(socket.id, data.roomname);
              break;
            }

          } else {

            var chatstate = new Chatstate();
                chatstate.room = data.roomname;
                chatstate.user = data.username;
                chatstate.state = 'active';
                chatstate.timetill = 0;
                chatstate.socketId = socket.id;
                chatstate.save();

                emitHistory(socket.id, data.roomname);
          }
        });
        
      }

      // There is NOT a room defined
      else {

        if( parseInt(data.user_id) == parseInt(data.owner) ){
          socket.request.session.isMod = true;
        }

        // Create a Room if it hasn't already been created
        var newRoom = new Rooms();
            newRoom.owner = typeof data.owner !== 'undefined' ? data.owner : 0;
            newRoom.name = data.roomname;
            newRoom.save();

        var chatstate = new Chatstate();
            chatstate.room = data.roomname;
            chatstate.user = data.username;
            chatstate.state = 'active';
            chatstate.timetill = 0;
            chatstate.socketId = socket.id;
            chatstate.save();

            
        // Join the chat
        socket.join(data.roomname);    

        io.to(socket.id).emit('room-joined', `You have joined the room ${data.roomname}`)
        
        emitHistory(socket.id, data.roomname);
      }

    });

  }); // End of the Join callback

  // We received a request to update the session
  socket.on('update_session', (data) => {
    if( data.update == 'modded'){
      socket.request.session.isMod = true;
    }
    if( data.update == 'unmodded'){
      socket.request.session.isMod = false;
    }
  }); //End of the update_session callback

  // GET THE LIST OF CHATTERS PER ROOM
  socket.on('chatlist', (room) => {

    data.username = data.username.toLowerCase();
    Chatstate.find({room: room, status: 'active', timetill: 0}, (err, chatters) => {
      io.in(room).emit('chatlist', {
        list : chatters
      });
    });
  }); // end of the get chatlist callback

  // RECEIVE CHAT MESSAGE
  socket.on('message', async (data) => {
    console.log('a messsage has been sent: ');
    
    data.username = data.username.toLowerCase();

    // Check if the there is a session from the user
    // that has mod or banned state
    var isMod = socket.request.session.isMod;
    var isBanned = socket.request.session.isBanned;

    // send a banned MEMO
    if( isBanned ){

      console.log('this user is banned');
      
      io.to(socket.id).emit("MEMO", {
        type: 'ban',
        message: 'You are currently banned and cannot post in this community chat (Only you can see this message).'
      });

      return;
    }

    // Check if the message is a command and whether 
    // the user is able to make the command.
    if( isMod && data.message[0] == '/' ){
      console.log('user is sending a command');
      let message = data.message.split(' ');

      let command = message[0].slice(1);

      let username = message[1].toLowerCase();

      let option = false;
      if( typeof message[2] !== 'undefined' )
        option = message[2];

      switch(command){
        case 'ban':
        executeBan(data.roomname, username, option);
        break;

        case 'unban':
        executeUnban(data.roomname, username, option);
        break;

        case 'timeout':
        executeTimeout(data.roomname, username, option);
        break;

        case 'mod':
        modThisUser(data.roomname, username, option);
        break;

        case 'unmod':
        unmodThisUser(data.roomname, username, option);
        break;

        case 'delete':
        let messageId = message[1].toLowerCase();
        deleteThisMessage(data.roomname, messageId);
        break;
      }

      return;
    } 

    else {

      let query = {
        $and:[{user: data.username.toLowerCase()}],
        $or:[{state:'timeout'}, {state:'ban'}],
        $nor: [{state:'active'}]
      };

      // Need to check if the user is currently banned or has a timeout
      Chatstate.findOne( query, (err, chatstate) => {

        if(err) {
         console.log(err);
         return;
        }

        if( chatstate && chatstate.state != 'active' ){

          switch(chatstate.state){

            case 'timeout':
              if( Date.now() / 1000 > chatstate.timetill){
                chatstate.state = 'active';
                chatstate.timetill = 0;
                chatstate.save();
                data = Object.assign(data, {id:socket.id});
                io.to(data.roomname).emit("message", data);
              } 
              else {

                var secondsleft = Math.floor(parseInt(chatstate.timetill) - Date.now()/1000);

                io.to(socket.id).emit("MEMO", {
                  message: `You are currently in a timeout for ${secondsleft} remaining seconds.`,
                  image : false,
                  type: 'timeout'
                });
                return;
              }
            break;
          }

        } else {

          data = Object.assign(data, {id:socket.id});
          
          let ChatLog = new Chatlog;
          ChatLog.room = data.roomname;
          ChatLog.user = data.username;
          ChatLog.user_id = data.user_id;
          ChatLog.message = data.message;
          Chatlog.color = data.color ?  data.color : '';
          ChatLog.replyTo = data.reply ? data.reply.text : '';
          ChatLog.timestamp = Date.now();

          if(data.role)
          ChatLog.role = data.role ? data.role.join(',') : '';
          
          ChatLog.save((err, savedChat) => {
            if (err) {
              console.error(err);
              return;
            }

            savedChat       = savedChat.toObject();
            savedChat.msgId = savedChat._id;
            savedChat.image = data.image ? data.image : '';
            savedChat.color = data.color ? data.color : '';
            delete savedChat._id;
            console.log(savedChat);
            
            // Emit the saved chat log, which includes the _id
            io.to(data.roomname).emit("message", savedChat);
          });
        }

      });
    }

  });

  // DISCONNECT FROM CHAT ROOM
  socket.on("disconnect", () => {

    Chatstate.findOne({socketId: socket.id}, (err, chatstate) => {

      if( err ) return;

      if( !chatstate ) return;

      if( chatstate ){
        chatstate.timetill = Date.now();
        chatstate.save();
      }
    });


    console.log(socket.id + ' has left');
    console.log("disconnected");
  });

  socket.on('error', function (err) {
    if (err.description) console.log(err.description)
    else console.log(err);
  });

});

// helper functions
// ----------------------------
function executeBan(roomname, username, option){
  
  // this is a possible note left by the mod
  var option = option ? option : '';
 
  Chatstate.findOne({room: roomname, user: username}, (err, chatstate) => {

    if( err ) return;

    if( chatstate ){

      io.to(chatstate.socketId).emit("MEMO", {
        type: 'ban',
        message: ''
      });

      chatstate.state = 'ban';
      chatstate.note = option;
      chatstate.timetill = 0;
      chatstate.save();
    }
  });

  Rooms.findOne({name: roomname}, (err, chatroom) => {

    if( err ) return;

    if( chatroom ){

      if( chatroom.bans.indexOf(username) > -1 ){     

        io.to(roomname).emit("NOTICE", {
          message: `${username} has already been banned from the chat`,
          type: 'ban',
          image : false,
          username: username
        });

      } else {            

        io.to(roomname).emit("NOTICE", {
          message: `${username} has been banned from the chat`,
          type: 'ban',
          image : false,
          username: username
        });
      }

      chatroom.bans.push(username);
      chatroom.markModified('bans');
      chatroom.save();

      return;
    }
  });
  // we also need to save this ban state in a database somewhere
}

function executeUnban(roomname, username, option){
  
  // this is a possible note left by the mod
  var option = option ? option : '';
 
  Chatstate.findOne({room: roomname, user: username}, (err, chatstate) => {

    if( err ) return;

    if( chatstate ){

      io.to(chatstate.socketId).emit("MEMO", {
        type: 'unban',
        message: ''
      });

      chatstate.state = 'active';
      chatstate.note = option;
      chatstate.timetill = 0;
      chatstate.save();
    }
  });

  Rooms.findOne({name: roomname}, (err, chatroom) => {

    if( err ) return;

    if( chatroom ){

      let index = chatroom.bans.indexOf(username);

      if( index < 0 ){     

        io.to(roomname).emit("NOTICE", {
          message: `${username} has already been unbanned from the chat`,
          type: 'ban',
          image : false,
          username: username
        });

      } else {            

        io.to(roomname).emit("NOTICE", {
          message: `${username} has been unbanned from the chat`,
          type: 'ban',
          image : false,
          username: username
        });
      }

      chatroom.bans.splice(index, 1);
      chatroom.markModified('bans');
      chatroom.save();

      return;
    }
  });
  // we also need to save this ban state in a database somewhere
}

function executeTimeout(roomname, username, option){

  let seconds = option ? option : 60;

  var nowTime = Date.now() / 1000;

  Chatstate.findOne({room: roomname, user: username}, (err, chatstate) => {

    if( err ) return;

    if( chatstate ){
      chatstate.state = 'timeout';
      chatstate.timetill = parseInt(nowTime) + parseInt(seconds);
      chatstate.save();
    }
  });

  io.to(roomname).emit("NOTICE", {
    message: `${username} has been timed out for ${seconds} seconds`,
    image : false,
    type: 'timeout',
    username: username
  });
  // we also need to save this ban state in a database somewhere
}

function modThisUser(roomname, username, option){

  Rooms.findOne({name: roomname},(err, room) => {

    if( err ) {
      io.to(socket.id).emit("NOTICE", {
        image : false,
        message: `Unable to add moderator ${username} at this time`,
      });
      return;
    }

    if( room ){

      let index = room.mods.indexOf(username);

      if (index < 0) {

        room.mods.push(username);
        room.markModified('mods');
        room.save();

        io.to(socket.id).emit("NOTICE", {
          message: `${username} has been added as a moderator.`,
          image : false,
          type: 'mod'
        });

      } else {

        io.to(socket.id).emit("NOTICE", {
          message: `${username} is already a moderator.`,
          image : false,
          type: 'mod'
        });
      }
      return;
    }
  });

  Chatstate.findOne({user: username, room: roomname}, (err, chatstate) => {
    if( err ) return;

    if( chatstate ){
      io.to(chatstate.socketId).emit("MEMO", {
        type : 'update',
        update : "modded",
        message : 'Congrats! You have mod access to this channel'
      });
    }
  });
}

function unmodThisUser(roomname, username, option){

  Rooms.findOne({name: roomname},(err, room) => {

    if( err ) {
      io.to(socket.id).emit("NOTICE", {
        image : false,
        message: `Unable to remove moderator ${username} at this time`,
      });
      return;
    }

    if( room ){

      let index = room.mods.indexOf(username);
      if (index > -1) room.mods.splice(index, 1);
      room.markModified('mods');
      room.save();

      io.to(socket.id).emit("NOTICE", {
        image : false,
        message: `${username} has been removed as a moderator.`,
        type: 'mod'
      });
      return;
    }
  });

  Chatstate.findOne({user: username, room: roomname}, (err, chatstate) => {
    if( err ) return;

    if( chatstate ){
      io.to(chatstate.socketId).emit("MEMO", {
        type : 'update',
        update : "unmodded",
        message : 'Your mod access to this channel has been removed'
      });
    }
  });
}

function deleteThisMessage(roomname, messageId){

  console.log(messageId);
  messageId = messageId.trim();

  Chatlog.findById(messageId, (err, message) => {

    if(err){
      console.log(err);
      return;
    }

    if(message){
      message.deleted = true;
      message.save((err) => {

        if (err) {
            console.log(err);
            return;
        }

        message = message.toObject();
        io.emit('deleted', {msgId : message._id});

      });
    }
  })
}

function array_unique(value, index, self) {
  return self.indexOf(value) === index;
}

server.listen(3001, ()=>{
  console.log('chat server listening on 3001');
});
