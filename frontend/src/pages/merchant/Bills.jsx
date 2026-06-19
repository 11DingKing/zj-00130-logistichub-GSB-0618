import { useState, useEffect } from "react";
import {
  Card,
  Table,
  Tag,
  Space,
  Select,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  message,
  Typography,
  Descriptions,
  Row,
  Col,
  Statistic,
  Table as AntTable,
  Timeline,
  Alert,
} from "antd";
import {
  DollarOutlined,
  EyeOutlined,
  FileTextOutlined,
  ExclamationCircleOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { billAPI, statsAPI } from "../../services/apiEndpoints";
import { useRequest } from "../../hooks/useRequest";
import dayjs from "dayjs";
import ReactECharts from "echarts-for-react";

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { TextArea } = Input;

const BILL_STATUS_MAP = {
  pending: { text: "待生成", color: "default" },
  issued: { text: "已出单", color: "blue" },
  paid: { text: "已支付", color: "green" },
  overdue: { text: "已逾期", color: "red" },
  cancelled: { text: "已取消", color: "default" },
  disputed: { text: "申诉中", color: "orange" },
  adjusted: { text: "已调整", color: "purple" },
};

const DISPUTE_STATUS_MAP = {
  pending: { text: "待审核", color: "orange" },
  approved: { text: "已批准（已调整）", color: "green" },
  rejected: { text: "已驳回", color: "red" },
};

const BILLING_METHOD_MAP = {
  daily: "按日计费",
  monthly: "按月计费",
  per_pallet: "按托盘计费",
  per_volume: "按体积计费",
  adjustment: "红字调整",
};

const MerchantBills = () => {
  const [filters, setFilters] = useState({ status: "", billingPeriod: "" });
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedBill, setSelectedBill] = useState(null);
  const [disputeModalVisible, setDisputeModalVisible] = useState(false);
  const [disputeForm] = Form.useForm();

  const {
    data: bills,
    loading,
    run: fetchBills,
  } = useRequest(() => billAPI.getMyBills(filters));

  const {
    data: billingStats,
    loading: statsLoading,
    run: fetchBillingStats,
  } = useRequest(() => statsAPI.getMerchantBilling());

  const { data: incomeTrend } = useRequest(() =>
    statsAPI.getIncomeTrend({ months: 6 }),
  );

  const { data: myDisputes, run: fetchMyDisputes } = useRequest(() =>
    billAPI.getMyDisputes(),
  );

  useEffect(() => {
    fetchBills();
    fetchBillingStats();
    fetchMyDisputes();
  }, [filters, fetchBills, fetchBillingStats, fetchMyDisputes]);

  const handleViewDetail = async (id) => {
    try {
      const response = await billAPI.getById(id);
      setSelectedBill(response.data);
      setDetailModalVisible(true);
    } catch (err) {
      message.error("获取账单详情失败");
    }
  };

  const handleOpenDispute = (bill) => {
    setSelectedBill(bill);
    disputeForm.resetFields();
    setDisputeModalVisible(true);
  };

  const handleSubmitDispute = async (values) => {
    try {
      const response = await billAPI.createDispute(selectedBill.id, {
        reason: values.reason,
        expectedAmount: values.expectedAmount ?? null,
      });
      message.success(response.data.message);
      setDisputeModalVisible(false);
      disputeForm.resetFields();
      fetchBills();
      fetchMyDisputes();
      if (detailModalVisible && selectedBill) {
        const refresh = await billAPI.getById(selectedBill.id);
        setSelectedBill(refresh.data);
      }
    } catch (err) {
      message.error(err.response?.data?.error || "提交申诉失败");
    }
  };

  const getChartOption = () => {
    if (!incomeTrend?.trends) return {};

    const months = incomeTrend.trends.map((t) => t.month);
    const amounts = incomeTrend.trends.map((t) => t.total_income);

    return {
      tooltip: { trigger: "axis" },
      xAxis: {
        type: "category",
        data: months,
      },
      yAxis: {
        type: "value",
        axisLabel: { formatter: "{value} 元" },
      },
      series: [
        {
          type: "line",
          data: amounts,
          smooth: true,
          itemStyle: { color: "#1890ff" },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(24, 144, 255, 0.3)" },
                { offset: 1, color: "rgba(24, 144, 255, 0.05)" },
              ],
            },
          },
        },
      ],
    };
  };

  const canDispute = (status) =>
    ["issued", "overdue", "adjusted"].includes(status);

  const columns = [
    {
      title: "账单编号",
      dataIndex: "bill_no",
      width: 180,
      render: (text) => <Text strong>{text}</Text>,
    },
    {
      title: "账期",
      dataIndex: "billing_period",
      width: 100,
    },
    {
      title: "金额",
      dataIndex: "total_amount",
      width: 120,
      render: (val) => (
        <Text strong style={{ color: "#f5222d" }}>
          ¥{Number(val).toFixed(2)}
        </Text>
      ),
    },
    {
      title: "明细项",
      dataIndex: "item_count",
      width: 80,
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 110,
      render: (val, record) => {
        const status = BILL_STATUS_MAP[val] || { text: val, color: "default" };
        return (
          <Space size={4}>
            <Tag color={status.color}>{status.text}</Tag>
            {record.pending_dispute_count > 0 && val !== "disputed" && (
              <Tag color="orange">申诉待审</Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: "出单时间",
      dataIndex: "issued_at",
      width: 160,
      render: (val) => (val ? dayjs(val).format("YYYY-MM-DD HH:mm") : "-"),
    },
    {
      title: "支付时间",
      dataIndex: "paid_at",
      width: 160,
      render: (val) => (val ? dayjs(val).format("YYYY-MM-DD HH:mm") : "-"),
    },
    {
      title: "操作",
      key: "action",
      width: 200,
      fixed: "right",
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleViewDetail(record.id)}
          >
            详情
          </Button>
          {canDispute(record.status) && (
            <Button
              type="link"
              size="small"
              icon={<WarningOutlined />}
              onClick={() => handleOpenDispute(record)}
            >
              发起申诉
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const itemColumns = [
    {
      title: "库位",
      dataIndex: "location_code",
      width: 100,
      render: (val, record) =>
        record.item_type === "adjustment" ? (
          <Tag color="purple">红字调整</Tag>
        ) : (
          val || "-"
        ),
    },
    {
      title: "货品",
      dataIndex: "category_name",
      width: 120,
      render: (val) => val || "-",
    },
    {
      title: "计费方式",
      dataIndex: "billing_method",
      width: 110,
      render: (val) => BILLING_METHOD_MAP[val] || val,
    },
    {
      title: "单价",
      dataIndex: "unit_price",
      width: 110,
      render: (val, record) => {
        if (record.item_type === "adjustment") return "-";
        const unitSuffix =
          record.billing_method === "monthly"
            ? "月"
            : record.billing_method === "daily"
              ? "天"
              : record.category_unit || "单位";
        return `¥${Number(val).toFixed(4)}/${unitSuffix}`;
      },
    },
    {
      title: "数量",
      dataIndex: "quantity",
      width: 100,
      render: (val, record) =>
        record.item_type === "adjustment"
          ? "-"
          : `${val} ${record.category_unit || ""}`,
    },
    {
      title: "天数",
      dataIndex: "days",
      width: 70,
      render: (val, record) => (record.item_type === "adjustment" ? "-" : val),
    },
    {
      title: "金额",
      dataIndex: "amount",
      width: 120,
      render: (val) => (
        <Text strong style={{ color: val < 0 ? "#52c41a" : "#f5222d" }}>
          {val < 0 ? "-" : ""}¥{Math.abs(Number(val)).toFixed(2)}
        </Text>
      ),
    },
    {
      title: "说明",
      dataIndex: "description",
      render: (val, record) => (
        <div>
          <div>{val}</div>
          {record.tier_breakdown && Array.isArray(record.tier_breakdown) && (
            <div style={{ marginTop: 4 }}>
              {record.tier_breakdown.map((tier, idx) => (
                <Tag key={idx} color="blue" style={{ marginBottom: 2 }}>
                  {tier.min}~{tier.max ?? "∞"}: {tier.quantity} × ¥
                  {tier.unit_price} = ¥{tier.subtotal.toFixed(2)}
                </Tag>
              ))}
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="累计消费"
              value={billingStats?.stats?.total_amount || 0}
              precision={2}
              prefix="¥"
              valueStyle={{ color: "#1890ff" }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="已支付"
              value={billingStats?.stats?.paid_amount || 0}
              precision={2}
              prefix="¥"
              valueStyle={{ color: "#52c41a" }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="待支付"
              value={billingStats?.stats?.unpaid_amount || 0}
              precision={2}
              prefix="¥"
              valueStyle={{ color: "#faad14" }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="账单总数"
              value={billingStats?.stats?.total_bills || 0}
              prefix={<FileTextOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Card title="消费趋势" style={{ marginBottom: 16 }}>
        <ReactECharts option={getChartOption()} style={{ height: 250 }} />
      </Card>

      {billingStats?.stats?.overdue_bills > 0 && (
        <Card
          style={{
            marginBottom: 16,
            borderColor: "#ffa39e",
            background: "#fff1f0",
          }}
        >
          <Space>
            <ExclamationCircleOutlined
              style={{ fontSize: 20, color: "#f5222d" }}
            />
            <Text type="danger">
              您有 {billingStats.stats.overdue_bills} 张逾期账单，金额 ¥
              {billingStats.stats.unpaid_amount?.toFixed(2)}，请及时支付。
            </Text>
          </Space>
        </Card>
      )}

      {myDisputes && myDisputes.length > 0 && (
        <Card title="我的申诉" size="small" style={{ marginBottom: 16 }}>
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={myDisputes}
            columns={[
              { title: "账单", dataIndex: "bill_no", width: 180 },
              { title: "账期", dataIndex: "billing_period", width: 100 },
              {
                title: "原账单金额",
                dataIndex: "bill_total_amount",
                width: 120,
                render: (v) => `¥${Number(v).toFixed(2)}`,
              },
              { title: "申诉理由", dataIndex: "reason", ellipsis: true },
              {
                title: "状态",
                dataIndex: "status",
                width: 130,
                render: (v) => {
                  const m = DISPUTE_STATUS_MAP[v];
                  return <Tag color={m.color}>{m.text}</Tag>;
                },
              },
              {
                title: "调整金额",
                dataIndex: "adjustment_amount",
                width: 120,
                render: (v) =>
                  v != null ? (
                    <Text style={{ color: v < 0 ? "#52c41a" : "#f5222d" }}>
                      ¥{Number(v).toFixed(2)}
                    </Text>
                  ) : (
                    "-"
                  ),
              },
              {
                title: "审核意见",
                dataIndex: "admin_response",
                ellipsis: true,
              },
              {
                title: "提交时间",
                dataIndex: "created_at",
                width: 160,
                render: (v) => (v ? dayjs(v).format("YYYY-MM-DD HH:mm") : "-"),
              },
              {
                title: "处理时间",
                dataIndex: "resolved_at",
                width: 160,
                render: (v) => (v ? dayjs(v).format("YYYY-MM-DD HH:mm") : "-"),
              },
            ]}
          />
        </Card>
      )}

      <Card title="全部账单">
        <Space style={{ marginBottom: 16 }} wrap>
          <Select
            placeholder="选择状态"
            style={{ width: 150 }}
            allowClear
            value={filters.status || undefined}
            onChange={(val) => setFilters({ ...filters, status: val || "" })}
          >
            {Object.entries(BILL_STATUS_MAP).map(([key, val]) => (
              <Option key={key} value={key}>
                {val.text}
              </Option>
            ))}
          </Select>
          <Select
            placeholder="选择账期"
            style={{ width: 150 }}
            allowClear
            value={filters.billingPeriod || undefined}
            onChange={(val) =>
              setFilters({ ...filters, billingPeriod: val || "" })
            }
          >
            {[
              "2026-06",
              "2026-05",
              "2026-04",
              "2026-03",
              "2026-02",
              "2026-01",
            ].map((p) => (
              <Option key={p} value={p}>
                {p}
              </Option>
            ))}
          </Select>
        </Space>

        <Table
          columns={columns}
          dataSource={bills}
          rowKey="id"
          loading={loading || statsLoading}
          scroll={{ x: 1200 }}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条记录`,
          }}
        />
      </Card>

      <Modal
        title="账单详情"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={null}
        width={960}
      >
        {selectedBill && (
          <div>
            <Descriptions
              bordered
              column={2}
              size="small"
              style={{ marginBottom: 16 }}
            >
              <Descriptions.Item label="账单编号">
                {selectedBill.bill_no}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={(BILL_STATUS_MAP[selectedBill.status] || {}).color}>
                  {(BILL_STATUS_MAP[selectedBill.status] || {}).text ||
                    selectedBill.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="账期">
                {selectedBill.billing_period}
              </Descriptions.Item>
              <Descriptions.Item label="总金额">
                <Text strong style={{ color: "#f5222d", fontSize: 18 }}>
                  ¥{Number(selectedBill.total_amount).toFixed(2)}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="出单时间">
                {selectedBill.issued_at
                  ? dayjs(selectedBill.issued_at).format("YYYY-MM-DD HH:mm")
                  : "-"}
              </Descriptions.Item>
              <Descriptions.Item label="支付时间">
                {selectedBill.paid_at
                  ? dayjs(selectedBill.paid_at).format("YYYY-MM-DD HH:mm")
                  : "-"}
              </Descriptions.Item>
              {selectedBill.remarks && (
                <Descriptions.Item label="备注" span={2}>
                  {selectedBill.remarks}
                </Descriptions.Item>
              )}
            </Descriptions>

            <Card size="small" title="账单明细" style={{ marginBottom: 16 }}>
              <AntTable
                columns={itemColumns}
                dataSource={selectedBill.items}
                rowKey="id"
                size="small"
                pagination={false}
                summary={(pageData) => {
                  let totalAmount = 0;
                  pageData.forEach(({ amount }) => {
                    totalAmount += Number(amount);
                  });
                  return (
                    <AntTable.Summary>
                      <AntTable.Summary.Row>
                        <AntTable.Summary.Cell index={0} colSpan={6}>
                          <Text strong>合计</Text>
                        </AntTable.Summary.Cell>
                        <AntTable.Summary.Cell index={6}>
                          <Text strong style={{ color: "#f5222d" }}>
                            ¥{totalAmount.toFixed(2)}
                          </Text>
                        </AntTable.Summary.Cell>
                        <AntTable.Summary.Cell
                          index={7}
                        ></AntTable.Summary.Cell>
                      </AntTable.Summary.Row>
                    </AntTable.Summary>
                  );
                }}
              />
            </Card>

            {selectedBill.disputes && selectedBill.disputes.length > 0 && (
              <Card size="small" title="申诉记录" style={{ marginBottom: 16 }}>
                <Timeline
                  items={selectedBill.disputes.map((d) => ({
                    color:
                      DISPUTE_STATUS_MAP[d.status].color === "orange"
                        ? "orange"
                        : d.status === "approved"
                          ? "green"
                          : "red",
                    children: (
                      <div>
                        <Tag color={DISPUTE_STATUS_MAP[d.status].color}>
                          {DISPUTE_STATUS_MAP[d.status].text}
                        </Tag>
                        <Text type="secondary" style={{ marginLeft: 8 }}>
                          {dayjs(d.created_at).format("YYYY-MM-DD HH:mm")}
                        </Text>
                        <Paragraph style={{ marginTop: 4, marginBottom: 4 }}>
                          <Text strong>申诉理由：</Text>
                          {d.reason}
                        </Paragraph>
                        {d.expected_amount != null && (
                          <Paragraph style={{ marginBottom: 4 }}>
                            <Text strong>期望金额：</Text>¥
                            {Number(d.expected_amount).toFixed(2)}
                          </Paragraph>
                        )}
                        {d.admin_response && (
                          <Paragraph style={{ marginBottom: 4 }}>
                            <Text strong>管理员意见：</Text>
                            {d.admin_response}
                          </Paragraph>
                        )}
                        {d.adjustment_amount != null && (
                          <Paragraph style={{ marginBottom: 0 }}>
                            <Text strong>红字调整金额：</Text>
                            <Text
                              style={{
                                color:
                                  d.adjustment_amount < 0
                                    ? "#52c41a"
                                    : "#f5222d",
                              }}
                            >
                              ¥{Number(d.adjustment_amount).toFixed(2)}
                            </Text>
                          </Paragraph>
                        )}
                        {d.resolved_at && (
                          <Text type="secondary">
                            处理时间：
                            {dayjs(d.resolved_at).format("YYYY-MM-DD HH:mm")}
                          </Text>
                        )}
                      </div>
                    ),
                  }))}
                />
              </Card>
            )}

            {(selectedBill.status === "issued" ||
              selectedBill.status === "overdue" ||
              selectedBill.status === "adjusted") && (
              <Card
                size="small"
                style={{
                  marginBottom: 16,
                  background: "#fffbe6",
                  borderColor: "#ffec3d",
                }}
              >
                <Space direction="vertical" style={{ width: "100%" }}>
                  <Text strong>支付信息</Text>
                  <Text>
                    请通过线下转账或联系客服完成支付，支付完成后账单状态将更新为已支付。
                  </Text>
                  <Text type="secondary">
                    银行账户：1234 5678 9012 3456（物流园对公账户）
                  </Text>
                </Space>
              </Card>
            )}

            {selectedBill.status === "disputed" && (
              <Alert
                style={{ marginBottom: 16 }}
                type="warning"
                showIcon
                message="账单申诉中"
                description="您已对该账单发起申诉，请等待管理员审核。审核通过后将生成红字调整明细，账单状态会变为已调整。"
              />
            )}

            <div style={{ marginTop: 16, textAlign: "right" }}>
              <Space>
                {canDispute(selectedBill.status) && (
                  <Button
                    icon={<WarningOutlined />}
                    onClick={() => {
                      setDetailModalVisible(false);
                      handleOpenDispute(selectedBill);
                    }}
                  >
                    对该账单发起申诉
                  </Button>
                )}
                <Button onClick={() => setDetailModalVisible(false)}>
                  关闭
                </Button>
              </Space>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        title={`对账单 ${selectedBill?.bill_no || ""} 发起申诉`}
        open={disputeModalVisible}
        onCancel={() => {
          setDisputeModalVisible(false);
          disputeForm.resetFields();
        }}
        footer={null}
        width={560}
      >
        <Alert
          style={{ marginBottom: 16 }}
          type="info"
          showIcon
          message="申诉提交后，账单状态将变为申诉中。管理员审核后会驳回或生成红字调整明细。"
        />
        <Form
          form={disputeForm}
          layout="vertical"
          onFinish={handleSubmitDispute}
        >
          <Form.Item
            name="reason"
            label="申诉理由"
            rules={[
              { required: true, message: "请填写申诉理由" },
              { min: 5, message: "理由至少 5 个字符" },
            ]}
          >
            <TextArea
              rows={4}
              placeholder="请详细说明申诉理由，例如：本月实际仓储天数与账单不符、计费档位错误等"
            />
          </Form.Item>
          <Form.Item name="expectedAmount" label="期望金额（可选）">
            <InputNumber
              style={{ width: "100%" }}
              placeholder="您认为合理的金额"
              prefix="¥"
              min={0}
              precision={2}
            />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                提交申诉
              </Button>
              <Button
                onClick={() => {
                  setDisputeModalVisible(false);
                  disputeForm.resetFields();
                }}
              >
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default MerchantBills;
