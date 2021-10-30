const { isValidObjectId } = require("mongoose");

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
  "uptime_monitor",
  "url_monitor",
  "tcp_monitor",
  "cpu_monitor",
  "disk_monitor",
  "file_monitor",
  "load_monitor",
  "swap_monitor",
  "inode_monitor",
  "service_monitor",
  "cron_monitor",
  "snmp_monitor",
])
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

exports.found_invalid_ids = (arr) => {
  arr.forEach(id => {
    if(!isValidObjectId(id)){
      console.log("Invalid ID found at : ", id);
      return true;
    }
  });
  return false;
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

exports.not_found = (object_name) => {
  return this.handle_error(object_name + " not found.")
}

exports.not_authenticated = this.handle_error("You are not authenticated to perform this operation.");

exports.exclusive_root_user_action = this.handle_error("This action can only be performed by the Root user.");