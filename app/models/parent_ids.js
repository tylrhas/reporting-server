module.exports = function (sequelize, Sequelize) {

    var lp_parent_id = sequelize.define('lp_parent_id', {
        id: {
            autoIncrement: true,
            primaryKey: true,
            type: Sequelize.INTEGER
        },
        task_id: {
            type: Sequelize.INTEGER
        },
        lp_parent_id: {
            type: Sequelize.INTEGER
        },
        lp_parent_name: {
            type: Sequelize.TEXT
        },
        is_done: {
            type: Sequelize.BOOLEAN
        },
        index: {
            type: Sequelize.INTEGER
        }
    });
    return lp_parent_id;
}