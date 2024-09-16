let users = [];

function joinUser(data) {
  const user = data;
  users.push(user)
  return user;
}

function removeUser(id) {
  const getID = users => users.socketID === id;
  const index =  users.findIndex(getID);
  if (index !== -1) {
    return users.splice(index, 1)[0];
  }
}

function getUser(id) {
  let user = users.find(user => user.id == id)
  return user;
}

function updateUser(id, object){

  var user = getUser(id);
  removeUser(id);

  user = Object.assign(user, object);

  joinUser(socketId, username, roomname);
}


function getUsers(room){
  return users.filter(user => user.room === room);
}


module.exports = { joinUser, removeUser, getUsers, getUser }