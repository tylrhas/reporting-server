module.exports = function (sequelize, Sequelize) {

  var lp_assignment = sequelize.define('lp_assignment', {

    id: {
      autoIncrement: true,
      primaryKey: true,
      type: Sequelize.INTEGER
    },
    task_id: {
      type: Sequelize.INTEGER
    },
    lp_user_id: {
      type: Sequelize.INTEGER
    },
    hours_logged: {
      type: Sequelize.REAL
    }
  });
  lp_assignment.associate = function (models) {
    // associate project tasks
    models.lp_assignment.belongsTo(models.project_folders, { foreignKey: 'id', sourceKey: 'task_id' });
  };

  return lp_assignment;

}