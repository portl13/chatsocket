const mongoose = require('mongoose');
var ChatstateSchema = new mongoose.Schema({
  room: {    
    type: 'string',
    description: 'The chat room name or number'
  },
  user: {
    type: 'string',
    description: 'The name of the user'
  },
  socketId: {
    type: 'string',
    description: 'The random assigned id by websocket'
  },
  state: {
    type: 'string',
    description: 'the current state of the user'
  },
  note: {
    type: 'string',
    description: 'Any special note left by a mod'
  },
  timetill : {
    type: 'number',
    description: 'the limit of time in this state'
  }
},{
  usePushEach: true,
  collection: 'chatstate'
});

var Chatstate = mongoose.model('Chatstate', ChatstateSchema);

module.exports = {Chatstate}