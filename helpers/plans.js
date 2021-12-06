const { isValidObjectId } = require("mongoose");
var ab2str = require('arraybuffer-to-string')

exports.get_capacity = (level) => {
    let users, devices, agents;
  switch (level) {
      case 0:
          users = 5;
          devices = 5;
          agents = 5;
          break;
  
      case 1:
          users = 10;
          devices = 10;
          agents = 10;
          break;
  
      case 2:
          users = 15;
          devices = 15;
          agents = 15;
          break;
  
      default:
        users = 5;
        devices = 5;
        agents = 5;
        break;
  }
  return {
      users,
      devices,
      agents
  }
}

const monitor_types = new Set([
  "uptime_monitor", // 
  "url_monitor", // 
  "tcp_monitor", // 
  "cpu_monitor", // 3 state
  "disk_monitor", // 3 state
  "file_monitor", // 3 state
  "load_monitor", // 
  "swap_monitor", // 
  "inode_monitor", // 
  "service_monitor", // 
  "cron_monitor", // 
  "snmp_monitor", // 
])

exports.binary_monitors = {
  "uptime_monitor" : true,
  "url_monitor" : true,
  "tcp_monitor" : true,
  "cpu_monitor" : false,
  "disk_monitor" : false,
  "file_monitor" : false,
  "service_monitor" : true,
  "snmp_monitor" : false,
}
exports.check_monitor_type = (type) => {
  return monitor_types.has(type);
}
exports.invalid_monitor_type = () => { return this.handle_error("Given monitor type is invalid.") };

exports.handle_error = (error_message_or_object) => {
  return {
      accomplished : false,
      response : error_message_or_object
  }
}

exports.handle_generated_error = (generated_error_object) => {
  return {
      accomplished : false,
      response : (generated_error_object && generated_error_object.message) ? generated_error_object.message : generated_error_object
  }
}

exports.maximum_limit_error = (object) => {
  return this.handle_error(`Your Team has reached it's maximum limit for ${object}s. Upgrade your plan to keep adding new ${object}s!`)
}

exports.handle_success = (success_message_or_object) => {
    return {
        accomplished : true,
        response : success_message_or_object
    }
  }

exports.is_root = (root_id, user_id) => {
  return root_id.equals(user_id);
  // return root_id === user_id.toString() ? true : false;
}

exports.found_invalid_ids = (array_of_ids, res) => {
  let check = false;
  let ids = [];
  array_of_ids.forEach(id => {
    if(!isValidObjectId(id)){
      console.log("Invalid ID found at : ", id);
      ids.push(id);
      check = true;
    }
  });
  return {
    invalid : check,
    ...(ids.length) && {
      message : "Invalid IDs found.",
    }
  };
}

exports.no_docs_or_error = (doc, error) => {
  if(!doc || error){
    return {
      is_true : true,
      message : this.handle_error((error && error.message) ? error.message : "Could not retrieve valid data from database.")
    }
  }
  return {
    is_true : false
  }
}

exports.validate_response = (err, doc, doc_type, res, callback) => {
  if(err) return res.json(this.handle_error(err.message)); 
  else if(!doc) return res.json(this.not_found(doc_type))
  
  callback();
}

exports.not_found = (object_name) => {
  return this.handle_error(object_name + " not found.")
}

exports.not_authenticated = this.handle_error("You are not authenticated to perform this operation.");

exports.exclusive_root_user_action = this.handle_error("This action can only be performed by the Root user.");

exports.webSocketSendJSON = async (ws, data) => {
  return new Promise(function (resolve, reject){
    try {
      ws.send(JSON.stringify(data));
      ws.on("message", function incoming(response){
      // const response_json = webSocketRecievedJSON(response);
      resolve(JSON.parse(ab2str(response)));
    })
    } catch (error) {
      reject(error);
    }
  });
}

exports.webSocketRecievedJSON = (data) => {
  return JSON.parse(ab2str(data));
}