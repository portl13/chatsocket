const mongoose = require('mongoose');
var ChatlogSchema = new mongoose.Schema({
  room: {    
    type: 'string',
    description: 'The chat room name'
  },
  user: {
    type: 'string',
    description: 'The username of the person sending the message'
  },
  user_id:{
    type: 'string',
    description: 'the user id of the person sending the message'
  },
  message: {
    type: 'string',
    description: 'the chat message'
  },
  role: {
    type: 'string',
    description: 'the role of the person who sent the message'
  },
  replyTo: {
    type: 'string',
    descrioption: 'the person being responded to'
  },
  deleted: {
    type: 'boolean',
    description: 'marked as soft deleted'
  },
  timestamp: {
    type: 'number',
    description: 'the unix timestamp of the message'
  },
  color: String
},{
  usePushEach: true,
  collection: 'chatlog',  
  timestamps: {
    createdAt: 'created_at', // Use `created_at` to store the created date
    updatedAt: 'updated_at' // and `updated_at` to store the last updated date
  }
});

var Chatlog = mongoose.model('Chatlog', ChatlogSchema);

module.exports = {Chatlog}