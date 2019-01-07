const throttledRequest = require('../config/throttled_request_promise')
const LPauth = "Basic " + new Buffer(process.env.LpUserName + ":" + process.env.LPPassword).toString("base64")
const db = require('../models')
const dates = require('./dates.controller')
const jobController = require('../controllers/job.controller')
const Papa = require("papaparse")
const Op = db.Sequelize.Op
const slack = require('../controllers/slack.controller')
module.exports = {
  update,
  locations,
  projects,
  updateNSDates,
  match
}

async function update(req, res) {
  if (req) {
    res.sendStatus(201)
  }
  await __updateJob('update_lbs', 'complete')
  var locations
  start_date = null
  if (req && req.body.start_date) {
    // check if there is a start date
    start_date = req.body.start_date
  }
  locations = await throttledRequest.promise({ url: process.env.LP_LBS_UPDATE, method: 'GET', headers: { "Authorization": LPauth } })
  locations = locations.rows
  for (let i = 0; i < locations.length; i++) {
    let location = locations[i]
    // update each lbs with the new info
    console.log(location)
    // parse out the location ID
    let splitName = location.name.split(/\s(.+)/, 2)
    let LBSId = splitName[0]
    let locationName = splitName[1]

    // create the update object
    let update = {
      task_id: location["key"],
      location_name: locationName,
      project_id: location["project_id"],
      stage: location["pick_list_custom_field:102670"],
      original_estimated_go_live: dates.pst_to_utc(location["date_custom_field:151494"]),
      estimated_go_live: dates.pst_to_utc(location["date_custom_field:147376"]),
      actual_go_live: dates.pst_to_utc(location["date_custom_field:151495"]),
      website_launch_date: dates.pst_to_utc(location["date_custom_field:151496"]),
      start_date: dates.pst_to_utc(location["date_custom_field:151496"]),
      project_lost_date: null,
    }

    let lsb = await db.lbs.findOrCreate({
      where: {
        id: LBSId
      }
    })

    if (location['pick_list_custom_field:102670'] === 'Lost') {
      //  check if the location is currently set to lost
      if (!lsbStatusCheck[1] || lsbStatusCheck.project_lost_date == null) {
        update.project_lost_date = dates.pst_to_utc(dates.now())
      }
    }

    await __findTreeItem(update)
    await lsb[0].update(update)
  }
  await __updateJob('update_lbs', 'complete')
}
async function locations(req, res) {
  try {
    var startDate = req.query.startDate
    var locations = await db.lbs.findAll({
      attributes: [['id', 'Internal ID'], ['estimated_go_live', 'Current Estimated Go-Live Date'], ['actual_go_live', 'Actual Go-Live Date'], ['original_estimated_go_live', 'Original Estimated Go-live'], ['website_launch_date', 'Website Launch Date'], ['start_date', 'Start Date'], ['project_lost_date', 'Project Lost date'], ['stage', 'Stage']],
      where: {
        updatedAt: {
          [db.Sequelize.Op.gte]: startDate
        }
      }
    })
    var csv = []
    for (let i = 0; i < locations.length; i++) {
      csv.push({
        'Internal ID': locations[i].dataValues['Internal ID'],
        'Current Estimated Go-Live Date': dates.utc_to_pst_no_time(locations[i].dataValues['Current Estimated Go-Live Date']),
        'Actual Go-Live Date': dates.utc_to_pst_no_time(locations[i].dataValues['Actual Go-Live Date']),
        'Original Estimated Go-live': dates.utc_to_pst_no_time(locations[i].dataValues['Original Estimated Go-live']),
        'Website Launch Date': dates.utc_to_pst_no_time(locations[i].dataValues['Website Launch Date']),
        'Start Date': dates.utc_to_pst_no_time(locations[i].dataValues['Start Date']),
        'Project Lost date': dates.utc_to_pst_no_time(locations[i].dataValues['Project Lost date']),
        'Stage': locations[i].dataValues['Stage']
      })
    }

    csv = Papa.unparse(csv)

    res.send(csv)
    // convert all dates from utc to PST for upload
  } catch (error) {
    res.send(error)
  }
}
async function projects(req, res) {
  try {
    var startDate = req.query.startDate
    var projects = await db.sequelize.query(`
     SELECT lbs.master_project_id, date.estimated_go_live, date.actual_go_live, date.original_estimated_go_live, date.start_date, date.website_launch_date, lbs.stage, COUNT(lbs.stage) AS stage_count
     FROM lbs AS lbs
     JOIN (
      SELECT master_project_id, MAX(estimated_go_live) AS estimated_go_live, MAX(actual_go_live) AS actual_go_live, MAX(original_estimated_go_live) AS original_estimated_go_live, MAX(start_date) AS start_date, MAX(website_launch_date) AS website_launch_date
      FROM lbs  
      GROUP BY master_project_id
     ) date ON date.master_project_id = lbs.master_project_id
     WHERE lbs."updatedAt" >= :startDate
     GROUP BY lbs.master_project_id, date.estimated_go_live, date.actual_go_live, date.original_estimated_go_live, date.start_date, date.website_launch_date, lbs.stage
     ORDER BY lbs.master_project_id ASC`,
      {
        replacements: { startDate: startDate },
        type: db.sequelize.QueryTypes.SELECT
      }
    )
    var csv = []
    // create CSV from json object and return it
    for (let i = 0; i < projects.length; i++) {
      try {
        let project = __getProjectStatus(projects, i)
        csv.push(project.data)
        i = project.newIndex
      } catch (error) {
        slack.sendError(error.message)
      }
      // get all all of the locations that stages that are part of this project
    }

    csv = Papa.unparse(csv)

    res.send(csv)
  } catch (error) {
    res.send(error.stack)
  }
}
async function updateNSDates(req, res) {
  var job = await __updateJob('ns_backlog', { status: 'running' })
  res.status(200)
  var updates = []
  var data = req.body.data
  var row
  // get the list of users in LP
  var users = await __get_all_lp_users()
  for (i = 0; i < data.length; i++) {
    if (data[i]['Internal ID'] !== undefined) {
      if (data[i].hasOwnProperty('Go-Live Date (Day)')) {
        // parse the PM name
        pmName = data[i]['PM'].trim().toLowerCase()
        pmName = pmName.replace(/ /g, "_")
        if (pmName in users) {
          pmID = users[pmName].id
        } else {
          pmID = null
        }
        row = {
          id: data[i]['Internal ID'],
          location_name: null,
          total_mrr: data[i]['Total MRR'],
          master_project_id: parseInt(data[i]['Master Project ID']),
          pm_id: pmID,
          gross_ps: data[i]['Gross Professional Services'],
          net_ps: data[i]['Net Professional Services'],
          total_ps_discount: data[i]['Total Professional Services Discount'],
          gross_cs: data[i]['Gross Creative Services'],
          net_cs: data[i]['Net Creative Services'],
          total_cs_discount: data[i]['Total Creative Services Discount'],
          actual_go_live: dates.pst_to_utc(data[i]['Go-Live Date (Day)']),
          project_type: data[i]['Project Type']
        }
        if (data[i]['Location'].split(/\s(.+)/).length > 1) {
          row.location_name = data[i]['Location'].split(/\s(.+)/)[1]
        } else {
          row.location_name = data[i]['Location'].split(/\s(.+)/)[0]
        }
      } else {
        // parse the PM name
        pmName = data[i]['PM'].trim().toLowerCase()
        pmName = pmName.replace(/ /g, "_")
        if (pmName in users) {
          pmID = users[pmName].id
        } else {
          pmID = null
        }

        row = {
          id: data[i]['Internal ID'],
          location_name: null,
          master_project_id: parseInt(data[i]['Master Project ID']),
          pm_id: pmID,
          total_mrr: data[i]['Total MRR'],
          gross_ps: data[i]['Gross Professional Services'],
          net_ps: data[i]['Net Professional Services'],
          total_ps_discount: data[i]['Total Professional Services Discount'],
          gross_cs: data[i]['Gross Creative Services'],
          net_cs: data[i]['Net Creative Services'],
          total_cs_discount: data[i]['Total Creative Services Discount'],
          estimated_go_live: dates.pst_to_utc(data[i]['Estimated Go-Live Date (Day)']),
          project_type: data[i]['Project Type'],
          stage: data[i]['OpenAir: Project Stage']
        }
        if (data[i]['Location'].split(/\s(.+)/).length > 1) {
          row.location_name = data[i]['Location'].split(/\s(.+)/)[1]
        } else {
          row.location_name = data[i]['Location'].split(/\s(.+)/)[0]
        }
      }
      if (data[i]['Opportunity Close Date'] != '') {
        row.opportunity_close_date = dates.pst_to_utc(data[i]['Opportunity Close Date'])
      } else {
        row.opportunity_close_date = null
      }

      updates.push(db.lbs.upsert(row).then(results => {
        console.log(results)
      }))
    }
  }
  Promise.all(updates).then(() => {
    if (data[0].hasOwnProperty('Estimated Go-Live Date (Day)')) {
      // get the first day of the month from this backlog
      var backlogDate = new Date(data[0]['Estimated Go-Live Date (Day)'])
      var today = new Date()
      var year = backlogDate.getFullYear()
      var month = backlogDate.getMonth()
      var firstDay = new Date(year, month, 1)
      var lastDay = new Date(year, month + 1, 0)

      // find all LBS tasks that are in this month and not updated today
      db.lbs.findAll({
        where: {
          estimated_go_live: {
            [Op.between]: [firstDay, lastDay]
          },
          updatedAt: {
            [Op.lt]: today.setHours(0, 0, 0, 0)
          },
          actual_go_live: null
        }
      }).then(nsLocation => {
        updates = []
        for (let i2 = 0; i2 < nsLocation.length; i2++) {
          updates.push(nsLocation[i2].update({ estimated_go_live: null }))
        }
        Promise.all([updates]).then(() => {
          job.update({ lastrun: dates.moment().format(), lastrunstatus: 'complete', status: 'active' })
        })
      })
    } else {
      job.update({ lastrun: dates.moment().format(), lastrunstatus: 'active' })
    }
  })
}
async function match(req, res) {

  // set the job to running 
  var job = await __updateJob('match_lbs', { status: 'running' })
  if (req) {
    res.sendStatus(201)
  }
  // select LSB from database where there is no task or project id
  var lsb = await db.lbs.findAll({
    where: {
      task_id: null,
      project_id: null
    },
    order: [
      ['estimated_go_live', 'DESC']
    ]
  })
  for (let i = 0; i < lsb.length; i++) {
    location = lsb[i]
    var url = `https://app.liquidplanner.com/api/workspaces/158330/tasks?filter[]=name contains ${location.id}`
    var treeitem = await throttledRequest.promise({ url: url, method: 'GET', headers: { "Authorization": LPauth } })
    if (treeitem.length > 0) {
      await __findTreeItem({ task_id: treeitem[0].id, project_id: treeitem[0].project_id })
      await location.update({
        task_id: treeitem[0].id,
        project_id: treeitem[0].project_id
      })
    }
  }
  await job.update({ lastrun: dates.moment().format(), lastrunstatus: 'active' })
}
async function __findTreeItem(update) {
  var treeItem = await db.treeitem.findOne({ where: { id: update.task_id } })
  if (treeItem === null) {
    // fetch the project from LP
    let projectURL = `https://app.liquidplanner.com/api/v1/workspaces/158330/treeitems/${update.project_id}?depth=-1&leaves=true`
    var project = await throttledRequest.promise({ url: projectURL, method: 'GET', headers: { "Authorization": LPauth } })
    try {
      await jobController._updateProject(project)
      // update every treeitem in project
      return
    } catch (error) {
      console.log(error)
    }
  } else {
    return
  }
  console.log(treeItem)
}
function __getProjectStatus(locations, i) {
  let currentProjectId = locations[i].master_project_id
  var stages = []
  var stage = null
  var data = {
    'Internal ID': locations[i].master_project_id,
    'Current Estimated Go-Live Date': dates.utc_to_pst_no_time(locations[i].estimated_go_live),
    'Actual Go-Live Date': dates.utc_to_pst_no_time(locations[i].actual_go_live),
    'Original Estimated Go-live': dates.utc_to_pst_no_time(locations[i].original_estimated_go_live),
    'Website Launch Date': dates.utc_to_pst_no_time(locations[i].website_launch_date),
    'Start Date': dates.utc_to_pst_no_time(locations[i].start_date),
    'Project Lost date': dates.utc_to_pst_no_time(locations[i].project_lost_date)
  }
  // push the first project into it
  while (i < locations.length && locations[i].master_project_id === currentProjectId) {
    stages.push(locations[i].stage)
    i++
  }
  // FIND THE GRATEST DATE FOR CEGL AND ACUTAL GO LIVE
  if (stages.indexOf('In Process') !== -1) {
    // a location is in process so set the project to in process
    stage = "In Process"
  } else if (stages.indexOf('On Hold') !== -1) {
    // there are on hold locations and no i process locations
    stage = "On Hold"
  } else if (stages.indexOf('Complete') !== -1 && stages.indexOf('On Hold') === -1) {
    // all locations are complete or lost so the project is complete
    stage = "Complete"
  } else if (stages.indexOf('Lost') !== -1 && stages.length === 1) {
    // all locations are Lost
    stage = "Lost"
  } else {
    throw new Error(`Error in finding the Stage of Master Project ID : ${currentProjectId}`)
  }
  data.Stage = stage
  if (data.Stage !== 'Complete') {
    data['Actual Go-Live Date'] = null
  }

  if (data.Stage !== 'Lost') {
    data['Project Lost date'] = null
  }

  return {
    newIndex: i - 1,
    data: data
  }
}
function __get_all_lp_users() {
  return db.lp_user.findAll().then(users => {
    userObject = {}
    for (i = 0; i < users.length; i++) {
      user = users[i]
      key = user.first_name.toLowerCase() + ' ' + user.last_name.toLowerCase()
      key = key.replace(/ /g, "_")
      userObject[key] = {
        first_name: user.first_name,
        last_name: user.last_name,
        id: user.id
      }
    }
    return userObject
  })
}
/**
 *
 *
 * @param {string} jobName
 * @param {*} update
 * @returns {}
 */
async function __updateJob(jobName, update) {
  var job = await db.job.findAll({
    where: {
      jobname: jobName
    }
  })

  await job[0].update(update)
  return job[0]
}
