import { useState, useEffect } from "react";
import {
  Row,
  Col,
  Card,
  Table,
  Tag,
  Space,
  Select,
  Button,
  Typography,
  Tabs,
  Statistic,
} from "antd";
import {
  BarChartOutlined,
  RiseOutlined,
  ClockCircleOutlined,
  StockOutlined,
  InboxOutlined,
  SendOutlined,
  TeamOutlined,
  SearchOutlined,
  SwapOutlined,
  DollarOutlined,
  FileTextOutlined,
} from "@ant-design/icons";
import { statsAPI } from "../../services/apiEndpoints";
import { useRequest } from "../../hooks/useRequest";
import { formatPercent, formatCapacity } from "../../utils/constants";
import dayjs from "dayjs";
import ReactECharts from "echarts-for-react";

const { Title, Text } = Typography;
const { TabPane } = Tabs;
const { Option } = Select;

const AdminStats = () => {
  const [daysFilter, setDaysFilter] = useState(30);
  const [slowDays, setSlowDays] = useState(90);

  const {
    data: utilization,
    loading: utilLoading,
    run: fetchUtilization,
  } = useRequest(
    () => statsAPI.getWarehouseUtilization({ days: daysFilter }),
    false,
  );
  const {
    data: turnover,
    loading: turnoverLoading,
    run: fetchTurnover,
  } = useRequest(
    () => statsAPI.getInventoryTurnover({ days: daysFilter }),
    false,
  );
  const {
    data: timeliness,
    loading: timelinessLoading,
    run: fetchTimeliness,
  } = useRequest(
    () => statsAPI.getTimelinessStats({ days: daysFilter }),
    false,
  );
  const {
    data: slowRatio,
    loading: ratioLoading,
    run: fetchSlowRatio,
  } = useRequest(() => statsAPI.getSlowMovingRatio({ days: slowDays }), false);
  const {
    data: transactions,
    loading: txnLoading,
    run: fetchTransactions,
  } = useRequest(() => statsAPI.getTransactions({ days: daysFilter }), false);
  const {
    data: warehouseTurnover,
    loading: wtLoading,
    run: fetchWarehouseTurnover,
  } = useRequest(
    () => statsAPI.getWarehouseTurnover({ days: daysFilter }),
    false,
  );
  const {
    data: warehouseIncome,
    loading: wiLoading,
    run: fetchWarehouseIncome,
  } = useRequest(
    () => statsAPI.getWarehouseIncome({ days: daysFilter }),
    false,
  );

  const fetchAllData = () => {
    fetchUtilization();
    fetchTurnover();
    fetchTimeliness();
    fetchSlowRatio();
    fetchTransactions();
    fetchWarehouseTurnover();
    fetchWarehouseIncome();
  };

  useEffect(() => {
    fetchAllData();
  }, [daysFilter, slowDays]);

  const getUtilizationChart = () => {
    if (!utilization) return {};
    return {
      tooltip: { trigger: "axis" },
      legend: { data: ["容量利用率", "库位利用率"] },
      xAxis: {
        type: "category",
        data: utilization.map((w) => w.name),
      },
      yAxis: {
        type: "value",
        max: 100,
        axisLabel: { formatter: "{value}%" },
      },
      series: [
        {
          name: "容量利用率",
          type: "bar",
          data: utilization.map((w) => w.capacityUtilization),
          itemStyle: { color: "#1890ff" },
        },
        {
          name: "库位利用率",
          type: "bar",
          data: utilization.map((w) => w.locationUtilization),
          itemStyle: { color: "#52c41a" },
        },
      ],
    };
  };

  const getTurnoverChart = () => {
    if (!turnover?.byCategory) return {};
    const categories = turnover.byCategory.filter((c) => c.current_stock > 0);
    return {
      tooltip: { trigger: "axis" },
      xAxis: {
        type: "category",
        data: categories.map((c) => c.name),
      },
      yAxis: [
        {
          type: "value",
          name: "周转次数",
          position: "left",
        },
        {
          type: "value",
          name: "周转天数",
          position: "right",
        },
      ],
      series: [
        {
          name: "月周转次数",
          type: "bar",
          data: categories.map((c) => c.turnoverRate),
          itemStyle: { color: "#52c41a" },
          yAxisIndex: 0,
        },
        {
          name: "周转天数",
          type: "line",
          data: categories.map((c) => c.turnoverDays || 0),
          itemStyle: { color: "#fa8c16" },
          yAxisIndex: 1,
        },
      ],
    };
  };

  const getTxnChart = () => {
    if (!transactions?.dailyStats) return {};

    const dateMap = {};
    transactions.dailyStats.forEach((t) => {
      if (!dateMap[t.txn_date]) {
        dateMap[t.txn_date] = { inbound: 0, outbound: 0 };
      }
      if (t.txn_type === "inbound") {
        dateMap[t.txn_date].inbound += t.txn_count;
      } else if (t.txn_type === "outbound") {
        dateMap[t.txn_date].outbound += t.txn_count;
      }
    });

    const dates = Object.keys(dateMap).sort();

    return {
      tooltip: { trigger: "axis" },
      legend: { data: ["入库单数", "出库单数"] },
      xAxis: {
        type: "category",
        data: dates.map((d) => dayjs(d).format("MM-DD")),
      },
      yAxis: { type: "value" },
      series: [
        {
          name: "入库单数",
          type: "line",
          data: dates.map((d) => dateMap[d]?.inbound || 0),
          smooth: true,
          itemStyle: { color: "#52c41a" },
        },
        {
          name: "出库单数",
          type: "line",
          data: dates.map((d) => dateMap[d]?.outbound || 0),
          smooth: true,
          itemStyle: { color: "#1890ff" },
        },
      ],
    };
  };

  const getWarehouseTurnoverChart = () => {
    if (!warehouseTurnover?.warehouses) return {};
    return {
      tooltip: { trigger: "axis" },
      legend: { data: ["周转次数", "周转天数"] },
      xAxis: {
        type: "category",
        data: warehouseTurnover.warehouses.map((w) => w.name),
      },
      yAxis: [
        {
          type: "value",
          name: "周转次数",
          position: "left",
        },
        {
          type: "value",
          name: "周转天数",
          position: "right",
        },
      ],
      series: [
        {
          name: "周转次数",
          type: "bar",
          data: warehouseTurnover.warehouses.map((w) => w.turnoverRate),
          itemStyle: { color: "#1890ff" },
          yAxisIndex: 0,
        },
        {
          name: "周转天数",
          type: "line",
          data: warehouseTurnover.warehouses.map((w) => w.turnoverDays || 0),
          itemStyle: { color: "#fa8c16" },
          yAxisIndex: 1,
        },
      ],
    };
  };

  const getWarehouseIncomeChart = () => {
    if (!warehouseIncome?.monthly) return {};
    const months = warehouseIncome.monthly.map((m) => m.period);
    return {
      tooltip: { trigger: "axis", formatter: "{b}<br/>仓储收入: ¥{c}" },
      xAxis: {
        type: "category",
        data: months,
      },
      yAxis: {
        type: "value",
        name: "仓储收入(元)",
        axisLabel: { formatter: "¥{value}" },
      },
      series: [
        {
          name: "仓储收入",
          type: "bar",
          data: warehouseIncome.monthly.map((m) => m.total),
          itemStyle: { color: "#52c41a" },
          label: {
            show: true,
            position: "top",
            formatter: "¥{c}",
          },
        },
      ],
    };
  };

  const merchantColumns = [
    {
      title: "商户",
      dataIndex: "name",
      width: 150,
    },
    {
      title: "公司",
      dataIndex: "company_name",
      width: 200,
    },
    {
      title: "呆滞批次",
      dataIndex: "slow_batches",
      width: 100,
      render: (v) => <Tag color="processing">{v} 批</Tag>,
    },
    {
      title: "呆滞数量",
      dataIndex: "slow_quantity",
      width: 120,
      render: (v) => (
        <Text type="warning" strong>
          {v.toFixed(0)}
        </Text>
      ),
    },
    {
      title: "主要品类",
      dataIndex: "top_category",
      width: 120,
    },
  ];

  return (
    <div>
      <div className="page-header">
        <Title level={3} style={{ margin: 0, marginBottom: 8 }}>
          统计分析
        </Title>
        <Text type="secondary">仓库运营数据统计与分析</Text>
      </div>

      <Space style={{ marginBottom: 16 }}>
        <Text type="secondary">统计周期:</Text>
        <Select
          value={daysFilter}
          onChange={setDaysFilter}
          style={{ width: 120 }}
        >
          <Option value={7}>最近7天</Option>
          <Option value={30}>最近30天</Option>
          <Option value={90}>最近90天</Option>
          <Option value={180}>最近180天</Option>
        </Select>
        <Text type="secondary" style={{ marginLeft: 16 }}>
          呆滞阈值:
        </Text>
        <Select value={slowDays} onChange={setSlowDays} style={{ width: 120 }}>
          <Option value={60}>60天未动</Option>
          <Option value={90}>90天未动</Option>
          <Option value={180}>180天未动</Option>
        </Select>
        <Button icon={<SearchOutlined />} onClick={fetchAllData}>
          查询
        </Button>
      </Space>

      <Tabs defaultActiveKey="utilization" type="card">
        <TabPane
          tab={
            <Space>
              <BarChartOutlined /> 仓库利用率
            </Space>
          }
          key="utilization"
        >
          <Row gutter={[16, 16]}>
            {utilization?.map((wh) => (
              <Col span={6} key={wh.id}>
                <Card className="card-shadow">
                  <Statistic
                    title={wh.name}
                    value={wh.capacityUtilization}
                    suffix="%"
                    valueStyle={{ color: "#1890ff" }}
                  />
                  <div style={{ marginTop: 8 }}>
                    <Text type="secondary">库位使用率: </Text>
                    <Tag color="green">
                      {formatPercent(wh.locationUtilization)}
                    </Tag>
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <Text type="secondary">近{daysFilter}天入库: </Text>
                    <Tag color="cyan">{wh.recentInbound} 单</Tag>
                    <Text type="secondary">出库: </Text>
                    <Tag color="geekblue">{wh.recentOutbound} 单</Tag>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>

          <Card
            className="card-shadow"
            style={{ marginTop: 16 }}
            title="各仓库利用率对比"
          >
            <ReactECharts
              option={getUtilizationChart()}
              style={{ height: 350 }}
              notMerge
            />
          </Card>
        </TabPane>

        <TabPane
          tab={
            <Space>
              <RiseOutlined /> 库存周转
            </Space>
          }
          key="turnover"
        >
          <Row gutter={[16, 16]}>
            <Col span={8}>
              <Card className="card-shadow">
                <Statistic
                  title={
                    <Space>
                      <StockOutlined /> 总出库量
                    </Space>
                  }
                  value={turnover?.overall?.outboundQuantity || 0}
                  precision={0}
                  valueStyle={{ color: "#1890ff" }}
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card className="card-shadow">
                <Statistic
                  title={
                    <Space>
                      <RiseOutlined /> 周转率
                    </Space>
                  }
                  value={turnover?.overall?.turnoverRate || 0}
                  suffix="次"
                  valueStyle={{ color: "#52c41a" }}
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card className="card-shadow">
                <Statistic
                  title={
                    <Space>
                      <ClockCircleOutlined /> 周转天数
                    </Space>
                  }
                  value={turnover?.overall?.turnoverDays || "-"}
                  suffix="天"
                  valueStyle={{ color: "#fa8c16" }}
                />
              </Card>
            </Col>
          </Row>

          <Card
            className="card-shadow"
            style={{ marginTop: 16 }}
            title="各品类周转情况"
          >
            <ReactECharts
              option={getTurnoverChart()}
              style={{ height: 350 }}
              notMerge
            />
          </Card>
        </TabPane>

        <TabPane
          tab={
            <Space>
              <ClockCircleOutlined /> 出入库及时率
            </Space>
          }
          key="timeliness"
        >
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <Card
                className="card-shadow"
                title={
                  <Space>
                    <InboxOutlined /> 入库处理
                  </Space>
                }
              >
                <Row gutter={16}>
                  <Col span={8}>
                    <Statistic
                      title="总单量"
                      value={timeliness?.inbound?.total || 0}
                      valueStyle={{ color: "#1890ff" }}
                    />
                  </Col>
                  <Col span={8}>
                    <Statistic
                      title="及时率"
                      value={timeliness?.inbound?.timelinessRate || 0}
                      suffix="%"
                      valueStyle={{ color: "#52c41a" }}
                    />
                  </Col>
                  <Col span={8}>
                    <Statistic
                      title="平均处理"
                      value={timeliness?.inbound?.avgProcessingDays || 0}
                      suffix="天"
                      valueStyle={{ color: "#fa8c16" }}
                    />
                  </Col>
                </Row>
              </Card>
            </Col>
            <Col span={12}>
              <Card
                className="card-shadow"
                title={
                  <Space>
                    <SendOutlined /> 出库处理
                  </Space>
                }
              >
                <Row gutter={16}>
                  <Col span={8}>
                    <Statistic
                      title="总单量"
                      value={timeliness?.outbound?.total || 0}
                      valueStyle={{ color: "#1890ff" }}
                    />
                  </Col>
                  <Col span={8}>
                    <Statistic
                      title="及时率"
                      value={timeliness?.outbound?.timelinessRate || 0}
                      suffix="%"
                      valueStyle={{ color: "#52c41a" }}
                    />
                  </Col>
                  <Col span={8}>
                    <Statistic
                      title="平均处理"
                      value={timeliness?.outbound?.avgProcessingDays || 0}
                      suffix="天"
                      valueStyle={{ color: "#fa8c16" }}
                    />
                  </Col>
                </Row>
              </Card>
            </Col>
          </Row>
        </TabPane>

        <TabPane
          tab={
            <Space>
              <StockOutlined /> 呆滞库存分析
            </Space>
          }
          key="slow"
        >
          <Row gutter={[16, 16]}>
            <Col span={6}>
              <Card className="card-shadow">
                <Statistic
                  title="呆滞批次"
                  value={slowRatio?.slowMoving?.slow_batches || 0}
                  suffix="批"
                  valueStyle={{ color: "#722ed1" }}
                />
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary">批次占比: </Text>
                  <Tag color="processing">
                    {formatPercent(slowRatio?.batchRatio)}
                  </Tag>
                </div>
              </Card>
            </Col>
            <Col span={6}>
              <Card className="card-shadow">
                <Statistic
                  title="呆滞数量"
                  value={slowRatio?.slowMoving?.slow_quantity || 0}
                  precision={0}
                  valueStyle={{ color: "#fa8c16" }}
                />
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary">数量占比: </Text>
                  <Tag color="warning">
                    {formatPercent(slowRatio?.quantityRatio)}
                  </Tag>
                </div>
              </Card>
            </Col>
            <Col span={6}>
              <Card className="card-shadow">
                <Statistic
                  title="影响商户"
                  value={slowRatio?.slowMoving?.slow_merchants || 0}
                  suffix="家"
                  valueStyle={{ color: "#f5222d" }}
                />
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary">总商户: </Text>
                  <Tag>{slowRatio?.total?.affected_merchants || 0} 家</Tag>
                </div>
              </Card>
            </Col>
            <Col span={6}>
              <Card className="card-shadow">
                <Statistic
                  title="呆滞阈值"
                  value={slowDays}
                  suffix="天"
                  valueStyle={{ color: "#1890ff" }}
                />
              </Card>
            </Col>
          </Row>

          <Card
            className="card-shadow"
            style={{ marginTop: 16 }}
            title={
              <Space>
                <TeamOutlined /> 商户呆滞库存排行
              </Space>
            }
          >
            <Table
              columns={merchantColumns}
              dataSource={slowRatio?.byMerchant || []}
              loading={ratioLoading}
              rowKey="id"
              pagination={false}
            />
          </Card>
        </TabPane>

        <TabPane
          tab={
            <Space>
              <BarChartOutlined /> 交易统计
            </Space>
          }
          key="transactions"
        >
          <Card className="card-shadow" title={`近${daysFilter}天交易趋势`}>
            <ReactECharts
              option={getTxnChart()}
              style={{ height: 350 }}
              notMerge
            />
          </Card>

          <Card
            className="card-shadow"
            style={{ marginTop: 16 }}
            title={
              <Space>
                <TeamOutlined /> 活跃商户排行
              </Space>
            }
          >
            <Table
              columns={[
                { title: "商户", dataIndex: "name", width: 150 },
                { title: "公司", dataIndex: "company_name", width: 200 },
                { title: "交易次数", dataIndex: "txn_count", width: 100 },
                {
                  title: "入库量",
                  dataIndex: "inbound_qty",
                  width: 100,
                  render: (v) => <Tag color="success">{v.toFixed(0)}</Tag>,
                },
                {
                  title: "出库量",
                  dataIndex: "outbound_qty",
                  width: 100,
                  render: (v) => <Tag color="primary">{v.toFixed(0)}</Tag>,
                },
              ]}
              dataSource={transactions?.topMerchants || []}
              loading={txnLoading}
              rowKey="id"
              pagination={false}
            />
          </Card>
        </TabPane>

        <TabPane
          tab={
            <Space>
              <SwapOutlined /> 仓库周转
            </Space>
          }
          key="warehouseTurnover"
        >
          <Row gutter={[16, 16]}>
            <Col span={8}>
              <Card className="card-shadow">
                <Statistic
                  title={
                    <Space>
                      <RiseOutlined /> 整体周转次数
                    </Space>
                  }
                  value={warehouseTurnover?.overall?.turnoverRate || 0}
                  suffix="次"
                  precision={2}
                  valueStyle={{ color: "#1890ff" }}
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card className="card-shadow">
                <Statistic
                  title={
                    <Space>
                      <ClockCircleOutlined /> 整体周转天数
                    </Space>
                  }
                  value={warehouseTurnover?.overall?.turnoverDays || "-"}
                  suffix="天"
                  precision={1}
                  valueStyle={{ color: "#52c41a" }}
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card className="card-shadow">
                <Statistic
                  title={
                    <Space>
                      <SwapOutlined /> 移库次数
                    </Space>
                  }
                  value={warehouseTurnover?.overall?.transferCount || 0}
                  suffix="次"
                  valueStyle={{ color: "#fa8c16" }}
                />
              </Card>
            </Col>
          </Row>

          <Card
            className="card-shadow"
            style={{ marginTop: 16 }}
            title="各仓库周转情况"
          >
            <ReactECharts
              option={getWarehouseTurnoverChart()}
              style={{ height: 350 }}
              notMerge
            />
          </Card>

          <Card
            className="card-shadow"
            style={{ marginTop: 16 }}
            title="各仓库周转明细"
          >
            <Table
              columns={[
                { title: "仓库", dataIndex: "name", width: 150 },
                {
                  title: "出库量",
                  dataIndex: "outboundQuantity",
                  width: 120,
                  render: (v) => (
                    <Tag color="primary">{v?.toFixed(0) || 0}</Tag>
                  ),
                },
                {
                  title: "平均库存",
                  dataIndex: "avgStock",
                  width: 120,
                  render: (v) => <Tag color="cyan">{v?.toFixed(0) || 0}</Tag>,
                },
                {
                  title: "周转次数",
                  dataIndex: "turnoverRate",
                  width: 120,
                  render: (v) => (
                    <Text strong style={{ color: "#1890ff" }}>
                      {v?.toFixed(2) || 0}
                    </Text>
                  ),
                },
                {
                  title: "周转天数",
                  dataIndex: "turnoverDays",
                  width: 120,
                  render: (v) => (
                    <Text strong style={{ color: "#52c41a" }}>
                      {v?.toFixed(1) || "-"}
                    </Text>
                  ),
                },
                {
                  title: "移库次数",
                  dataIndex: "transferCount",
                  width: 100,
                  render: (v) => <Tag color="orange">{v || 0}</Tag>,
                },
              ]}
              dataSource={warehouseTurnover?.warehouses || []}
              loading={wtLoading}
              rowKey="id"
              pagination={false}
            />
          </Card>
        </TabPane>

        <TabPane
          tab={
            <Space>
              <DollarOutlined /> 仓储收入
            </Space>
          }
          key="warehouseIncome"
        >
          <Row gutter={[16, 16]}>
            <Col span={8}>
              <Card className="card-shadow">
                <Statistic
                  title={
                    <Space>
                      <DollarOutlined /> 总仓储收入
                    </Space>
                  }
                  value={warehouseIncome?.overall?.total || 0}
                  prefix="¥"
                  precision={2}
                  valueStyle={{ color: "#52c41a" }}
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card className="card-shadow">
                <Statistic
                  title={
                    <Space>
                      <FileTextOutlined /> 已生成账单
                    </Space>
                  }
                  value={warehouseIncome?.overall?.billCount || 0}
                  suffix="张"
                  valueStyle={{ color: "#1890ff" }}
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card className="card-shadow">
                <Statistic
                  title={
                    <Space>
                      <DollarOutlined /> 平均月收入
                    </Space>
                  }
                  value={warehouseIncome?.overall?.avgMonthly || 0}
                  prefix="¥"
                  precision={2}
                  valueStyle={{ color: "#fa8c16" }}
                />
              </Card>
            </Col>
          </Row>

          <Card
            className="card-shadow"
            style={{ marginTop: 16 }}
            title="月度仓储收入趋势"
          >
            <ReactECharts
              option={getWarehouseIncomeChart()}
              style={{ height: 350 }}
              notMerge
            />
          </Card>

          <Card
            className="card-shadow"
            style={{ marginTop: 16 }}
            title="各仓库收入明细"
          >
            <Table
              columns={[
                { title: "仓库", dataIndex: "name", width: 150 },
                {
                  title: "已收金额",
                  dataIndex: "paid",
                  width: 120,
                  render: (v) => (
                    <Text strong style={{ color: "#52c41a" }}>
                      ¥{v?.toFixed(2) || 0}
                    </Text>
                  ),
                },
                {
                  title: "待收金额",
                  dataIndex: "unpaid",
                  width: 120,
                  render: (v) => (
                    <Text strong style={{ color: "#fa8c16" }}>
                      ¥{v?.toFixed(2) || 0}
                    </Text>
                  ),
                },
                {
                  title: "总收入",
                  dataIndex: "total",
                  width: 120,
                  render: (v) => (
                    <Text strong style={{ color: "#1890ff" }}>
                      ¥{v?.toFixed(2) || 0}
                    </Text>
                  ),
                },
                {
                  title: "账单数",
                  dataIndex: "billCount",
                  width: 100,
                  render: (v) => <Tag color="cyan">{v || 0} 张</Tag>,
                },
                {
                  title: "收费商户",
                  dataIndex: "merchantCount",
                  width: 100,
                  render: (v) => <Tag color="purple">{v || 0} 家</Tag>,
                },
              ]}
              dataSource={warehouseIncome?.byWarehouse || []}
              loading={wiLoading}
              rowKey="id"
              pagination={false}
            />
          </Card>
        </TabPane>
      </Tabs>
    </div>
  );
};

export default AdminStats;
