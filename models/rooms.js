const mongoose = require('mongoose');
var RoomsSchema = new mongoose.Schema({
  name: {    
    type: 'string',
    description: 'The chat room name or number'
  },
  bans: [],
  mods: [],
  vips: [],
  subscribers: []
},{
  usePushEach: true,
  collection: 'rooms'
});

var Rooms = mongoose.model('Rooms', RoomsSchema);

module.exports = {Rooms}