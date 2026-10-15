// Creates browser Web Push subscriptions for OS-level visit notifications.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("push_subscriptions", {
      id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
      user_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      endpoint: { type: Sequelize.TEXT, allowNull: false, unique: true },
      p256dh: { type: Sequelize.TEXT, allowNull: false },
      auth: { type: Sequelize.TEXT, allowNull: false },
      user_agent: { type: Sequelize.STRING(500), allowNull: true },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn("NOW") },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn("NOW") },
    });
    await queryInterface.addIndex("push_subscriptions", ["user_id"], {
      name: "idx_push_subs_user",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("push_subscriptions");
  },
};
