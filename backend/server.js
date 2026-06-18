const express = require("express");
const cors = require("cors");
require("dotenv").config();

const authRoutes = require("./routes/auth");
const warehouseRoutes = require("./routes/warehouses");
const locationRoutes = require("./routes/locations");
const leaseRoutes = require("./routes/leases");
const inboundRoutes = require("./routes/inbound");
const outboundRoutes = require("./routes/outbound");
const inventoryRoutes = require("./routes/inventory");
const statsRoutes = require("./routes/stats");
const userRoutes = require("./routes/users");
const transferRoutes = require("./routes/transfers");
const billRoutes = require("./routes/bills");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/warehouses", warehouseRoutes);
app.use("/api/locations", locationRoutes);
app.use("/api/leases", leaseRoutes);
app.use("/api/inbound", inboundRoutes);
app.use("/api/outbound", outboundRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/users", userRoutes);
app.use("/api/transfers", transferRoutes);
app.use("/api/bills", billRoutes);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "物流枢纽运营平台服务运行正常" });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || "服务器内部错误" });
});

app.listen(PORT, () => {
  console.log(`🚀 物流枢纽运营平台后端服务已启动: http://localhost:${PORT}`);
});
