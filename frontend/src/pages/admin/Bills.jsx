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
  DatePicker,
  message,
  Typography,
  Descriptions,
  Row,
  Col,
  Statistic,
  InputNumber,
  Table as AntTable,
  Input,
  Alert,
  Badge,
  Tabs,
  Divider,
} from "antd";
import {
  DollarOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  CloseOutlined,
  FileTextOutlined,
  PlusOutlined,
  ExclamationCircleOutlined,
  DownloadOutlined,
  QuestionCircleOutlined,
  DislikeOutlined,
  EditOutlined,
} from "@ant-design/icons";
import { billAPI, userAPI, statsAPI } from "../../services/apiEndpoints";
import { useRequest } from "../../hooks/useRequest";
import {
  BILL_STATUS_MAP,
  BILLING_METHOD_MAP,
  DISPUTE_STATUS_MAP,
} from "../../utils/constants";
import dayjs from "dayjs";
import ReactECharts from "echarts-for-react";

const { Title, Text } = Typography;
const { Option } = Select;
const { MonthPicker } = DatePicker;
const { TextArea } = Input;

const AdminBills = () => {
  const [filters, setFilters] = useState({
    status: "",
    merchantId: "",
    billingPeriod: "",
  });
  const [generateModalVisible, setGenerateModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [disputeModalVisible, setDisputeModalVisible] = useState(false);
  const [selectedBill, setSelectedBill] = useState(null);
  const [selectedDispute, setSelectedDispute] = useState(null);
  const [activeTab, setActiveTab] = useState("bills");
  const [generateForm] = Form.useForm();
  const [disputeForm] = Form.useForm();

  const {
    data: bills,
    loading,
    run: fetchBills,
  } = useRequest(() => billAPI.getAll(filters));

  const {
    data: summary,
    loading: summaryLoading,
    run: fetchSummary,
  } = useRequest(() => billAPI.getSummary());

  const { data: incomeTrend, run: fetchIncomeTrend } = useRequest(() =>
    statsAPI.getIncomeTrend({ months: 12 }),
  );

  const {
    data: disputes,
    loading: disputesLoading,
    run: fetchDisputes,
  } = useRequest(() => billAPI.getDisputes({}));

  const { data: merchants } = useRequest(() => userAPI.getMerchants());

  useEffect(() => {
    fetchBills();
    fetchDisputes();
  }, [filters, fetchBills, fetchDisputes]);

  useEffect(() => {
    fetchSummary();
    fetchIncomeTrend();
  }, [fetchSummary, fetchIncomeTrend]);

  const handleGenerateBills = async (values) => {
    try {
      const year = values.month.year();
      const month = values.month.month() + 1;
      const response = await billAPI.generateMonthly({
        year,
        month,
        force: values.force || false,
      });
      message.success(response.data.message);
      setGenerateModalVisible(false);
      generateForm.resetFields();
      fetchBills();
      fetchSummary();
      fetchIncomeTrend();
    } catch (err) {
      message.error(err.response?.data?.error || "生成账单失败");
    }
  };

  const handleViewDetail = async (id) => {
    try {
      const response = await billAPI.getById(id);
      setSelectedBill(response.data);
      setDetailModalVisible(true);
    } catch (err) {
      message.error("获取账单详情失败");
    }
  };

  const handleViewDispute = async (dispute) => {
    try {
      const response = await billAPI.getDisputeById(dispute.id);
      setSelectedDispute(response.data);
      disputeForm.resetFields();
      setDisputeModalVisible(true);
    } catch (err) {
      message.error("获取申诉详情失败");
    }
  };

  const handleMarkPaid = async (id) => {
    Modal.confirm({
      title: "确认标记为已支付",
      icon: <CheckCircleOutlined />,
      content: "确认此账单已收到款项？",
      onOk: async () => {
        try {
          const response = await billAPI.markPaid(id);
          message.success(response.data.message);
          fetchBills();
          fetchSummary();
          fetchDisputes();
          if (selectedBill?.id === id) {
            const detailResponse = await billAPI.getById(id);
            setSelectedBill(detailResponse.data);
          }
        } catch (err) {
          message.error(err.response?.data?.error || "操作失败");
        }
      },
    });
  };

  const handleMarkOverdue = async (id) => {
    Modal.confirm({
      title: "确认标记为逾期",
      icon: <WarningOutlined />,
      content: "确认此账单已逾期？",
      onOk: async () => {
        try {
          const response = await billAPI.markOverdue(id);
          message.success(response.data.message);
          fetchBills();
          fetchSummary();
          fetchDisputes();
        } catch (err) {
          message.error(err.response?.data?.error || "操作失败");
        }
      },
    });
  };

  const handleCancelBill = async (id) => {
    Modal.confirm({
      title: "确认取消账单",
      icon: <ExclamationCircleOutlined />,
      content: "确定要取消此账单吗？",
      onOk: async () => {
        try {
          const response = await billAPI.cancel(id);
          message.success(response.data.message);
          fetchBills();
          fetchSummary();
          fetchDisputes();
        } catch (err) {
          message.error(err.response?.data?.error || "取消失败");
        }
      },
    });
  };

  const handleRejectDispute = async () => {
    try {
      const values = await disputeForm.validateFields();
      const response = await billAPI.rejectDispute(selectedDispute.id, {
        adminNote: values.adminNote,
      });
      message.success(response.data.message);
      setDisputeModalVisible(false);
      fetchBills();
      fetchSummary();
      fetchDisputes();
    } catch (err) {
      if (err.errorFields) return;
      message.error(err.response?.data?.error || "驳回失败");
    }
  };

  const handleAdjustDispute = async () => {
    try {
      const values = await disputeForm.validateFields();
      if (!values.adjustmentAmount || values.adjustmentAmount <= 0) {
        message.error("请输入有效的调整金额");
        return;
      }
      const response = await billAPI.adjustDispute(selectedDispute.id, {
        adjustmentAmount: values.adjustmentAmount,
        adjustmentReason: values.adjustmentReason,
      });
      message.success(response.data.message);
      setDisputeModalVisible(false);
      fetchBills();
      fetchSummary();
      fetchDisputes();
      fetchIncomeTrend();
    } catch (err) {
      if (err.errorFields) return;
      message.error(err.response?.data?.error || "调整失败");
    }
  };

  const getChartOption = () => {
    if (!incomeTrend?.trends) return {};

    const months = incomeTrend.trends.map((t) => t.month);
    const totalIncome = incomeTrend.trends.map((t) => t.total_income);
    const receivedIncome = incomeTrend.trends.map((t) => t.received_income);

    return {
      tooltip: { trigger: "axis" },
      legend: { data: ["总营收", "已收款"] },
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
          name: "总营收",
          type: "bar",
          data: totalIncome,
          itemStyle: { color: "#1890ff" },
        },
        {
          name: "已收款",
          type: "bar",
          data: receivedIncome,
          itemStyle: { color: "#52c41a" },
        },
      ],
    };
  };

  const columns = [
    {
      title: "账单编号",
      dataIndex: "bill_no",
      width: 180,
      render: (text, record) => (
        <Space>
          <Text strong>{text}</Text>
          {record.dispute_status === "pending" && (
            <Badge count="申诉" style={{ backgroundColor: "#fa8c16" }} />
          )}
        </Space>
      ),
    },
    {
      title: "商户",
      dataIndex: "merchant_name",
      width: 120,
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
      render: (val, record) => (
        <span>
          <Text strong style={{ color: "#f5222d" }}>
            ¥{val.toFixed(2)}
          </Text>
          {record.adjusted_amount > 0 && (
            <Text type="secondary" style={{ fontSize: 12, marginLeft: 4 }}>
              (减免¥{record.adjusted_amount.toFixed(2)})
            </Text>
          )}
        </span>
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
      render: (val) => {
        const status = BILL_STATUS_MAP[val];
        return <Tag color={status.color}>{status.text}</Tag>;
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
      width: 280,
      fixed: "right",
      render: (_, record) => (
        <Space wrap>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleViewDetail(record.id)}
          >
            详情
          </Button>
          {record.dispute_status === "pending" && (
            <Button
              type="link"
              size="small"
              style={{ color: "#fa8c16" }}
              icon={<QuestionCircleOutlined />}
              onClick={() =>
                handleViewDispute({ id: record.dispute_id, bill_id: record.id })
              }
            >
              处理申诉
            </Button>
          )}
          {(record.status === "issued" ||
            record.status === "overdue" ||
            record.status === "dispute_rejected" ||
            record.status === "adjusted") && (
            <Button
              type="link"
              size="small"
              icon={<CheckCircleOutlined />}
              onClick={() => handleMarkPaid(record.id)}
            >
              标记支付
            </Button>
          )}
          {(record.status === "issued" ||
            record.status === "dispute_rejected") && (
            <Button
              type="link"
              size="small"
              danger
              icon={<WarningOutlined />}
              onClick={() => handleMarkOverdue(record.id)}
            >
              标记逾期
            </Button>
          )}
          {!["paid", "disputed", "adjusted"].includes(record.status) && (
            <Button
              type="link"
              size="small"
              danger
              icon={<CloseOutlined />}
              onClick={() => handleCancelBill(record.id)}
            >
              取消
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const disputeColumns = [
    {
      title: "账单编号",
      dataIndex: "bill_no",
      width: 180,
      render: (text) => <Text strong>{text}</Text>,
    },
    {
      title: "商户",
      dataIndex: "merchant_name",
      width: 120,
      render: (_, record) =>
        `${record.merchant_name} (${record.merchant_company})`,
    },
    {
      title: "账期",
      dataIndex: "billing_period",
      width: 100,
    },
    {
      title: "账单金额",
      dataIndex: "bill_total_amount",
      width: 110,
      render: (val) => <Text strong>¥{val?.toFixed(2)}</Text>,
    },
    {
      title: "申诉理由",
      dataIndex: "reason",
      ellipsis: true,
      width: 250,
    },
    {
      title: "申诉状态",
      dataIndex: "status",
      width: 100,
      render: (val) => {
        const s = DISPUTE_STATUS_MAP[val];
        return <Tag color={s?.color}>{s?.text}</Tag>;
      },
    },
    {
      title: "调整金额",
      dataIndex: "adjustment_amount",
      width: 100,
      render: (val) =>
        val > 0 ? (
          <Text style={{ color: "#52c41a" }}>¥{val.toFixed(2)}</Text>
        ) : (
          "-"
        ),
    },
    {
      title: "申诉时间",
      dataIndex: "created_at",
      width: 160,
      render: (val) => (val ? dayjs(val).format("YYYY-MM-DD HH:mm") : "-"),
    },
    {
      title: "操作",
      key: "action",
      width: 100,
      fixed: "right",
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleViewDispute(record)}
          >
            {record.status === "pending" ? "处理" : "查看"}
          </Button>
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
        val || (record.billing_method === "adjustment" ? "-" : val),
    },
    {
      title: "货品",
      dataIndex: "category_name",
      width: 120,
      render: (val, record) =>
        val ||
        (record.billing_method === "adjustment" ? (
          <Text type="danger">红字调整</Text>
        ) : (
          val
        )),
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
      width: 120,
      render: (val, record) => {
        if (record.billing_method === "adjustment") return "-";
        return `¥${val.toFixed(2)}/${record.billing_method === "monthly" ? "月" : record.billing_method === "daily" ? "天" : record.category_unit || "单位"}`;
      },
    },
    {
      title: "数量",
      dataIndex: "quantity",
      width: 100,
      render: (val, record) =>
        record.billing_method === "adjustment"
          ? "-"
          : `${val} ${record.category_unit || ""}`,
    },
    {
      title: "天数",
      dataIndex: "days",
      width: 80,
      render: (val, record) =>
        record.billing_method === "adjustment" ? "-" : val,
    },
    {
      title: "金额",
      dataIndex: "amount",
      width: 110,
      render: (val) => (
        <Text strong style={{ color: val < 0 ? "#52c41a" : "#f5222d" }}>
          ¥{val.toFixed(2)}
        </Text>
      ),
    },
    {
      title: "说明",
      dataIndex: "description",
      render: (val) => (
        <Text type={val && val.includes("【红字调整】") ? "danger" : undefined}>
          {val}
        </Text>
      ),
    },
  ];

  const pendingDisputes = disputes?.filter((d) => d.status === "pending") || [];

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="总营收"
              value={summary?.summary?.total_amount || 0}
              precision={2}
              prefix="¥"
              valueStyle={{ color: "#1890ff" }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="已收款"
              value={summary?.summary?.received_amount || 0}
              precision={2}
              prefix="¥"
              valueStyle={{ color: "#52c41a" }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="待收款"
              value={summary?.summary?.receivable_amount || 0}
              precision={2}
              prefix="¥"
              valueStyle={{ color: "#faad14" }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="待处理申诉"
              value={summary?.summary?.pending_disputes || 0}
              valueStyle={{
                color: pendingDisputes.length > 0 ? "#f5222d" : "#8c8c8c",
              }}
              prefix={<QuestionCircleOutlined />}
              suffix={
                pendingDisputes.length > 0 ? (
                  <Badge
                    count={pendingDisputes.length}
                    style={{ backgroundColor: "#f5222d" }}
                  />
                ) : null
              }
            />
          </Card>
        </Col>
      </Row>

      <Card title="营收趋势" style={{ marginBottom: 16 }}>
        <ReactECharts option={getChartOption()} style={{ height: 300 }} />
      </Card>

      <Card>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: "bills",
              label: (
                <span>
                  <FileTextOutlined />
                  账单列表
                </span>
              ),
              children: (
                <>
                  <Space style={{ marginBottom: 16 }} wrap>
                    <Select
                      placeholder="选择状态"
                      style={{ width: 150 }}
                      allowClear
                      value={filters.status || undefined}
                      onChange={(val) =>
                        setFilters({ ...filters, status: val || "" })
                      }
                    >
                      {Object.entries(BILL_STATUS_MAP).map(([key, val]) => (
                        <Option key={key} value={key}>
                          {val.text}
                        </Option>
                      ))}
                    </Select>
                    <Select
                      placeholder="选择商户"
                      style={{ width: 180 }}
                      allowClear
                      showSearch
                      optionFilterProp="children"
                      value={filters.merchantId || undefined}
                      onChange={(val) =>
                        setFilters({ ...filters, merchantId: val || "" })
                      }
                    >
                      {merchants?.map((m) => (
                        <Option key={m.id} value={m.id}>
                          {m.name} ({m.company_name})
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
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => setGenerateModalVisible(true)}
                    >
                      生成月度账单
                    </Button>
                  </Space>

                  <Table
                    columns={columns}
                    dataSource={bills}
                    rowKey="id"
                    loading={loading || summaryLoading}
                    scroll={{ x: 1400 }}
                    pagination={{
                      pageSize: 10,
                      showSizeChanger: true,
                      showTotal: (total) => `共 ${total} 条记录`,
                    }}
                  />
                </>
              ),
            },
            {
              key: "disputes",
              label: (
                <Badge count={pendingDisputes.length} offset={[10, 0]}>
                  <span>
                    <QuestionCircleOutlined />
                    申诉管理
                  </span>
                </Badge>
              ),
              children: (
                <Table
                  columns={disputeColumns}
                  dataSource={disputes}
                  rowKey="id"
                  loading={disputesLoading}
                  scroll={{ x: 1200 }}
                  pagination={{
                    pageSize: 10,
                    showSizeChanger: true,
                    showTotal: (total) => `共 ${total} 条申诉`,
                  }}
                />
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title="生成月度账单"
        open={generateModalVisible}
        onCancel={() => {
          setGenerateModalVisible(false);
          generateForm.resetFields();
        }}
        footer={null}
        width={500}
      >
        <Form
          form={generateForm}
          layout="vertical"
          onFinish={handleGenerateBills}
        >
          <Form.Item
            name="month"
            label="选择账期月份"
            rules={[{ required: true, message: "请选择月份" }]}
          >
            <MonthPicker style={{ width: "100%" }} placeholder="选择月份" />
          </Form.Item>
          <Form.Item name="force" valuePropName="checked">
            <Select placeholder="如该月账单已存在">
              <Option value={false}>跳过已生成的商户</Option>
              <Option value={true}>覆盖重新生成</Option>
            </Select>
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                生成账单
              </Button>
              <Button
                onClick={() => {
                  setGenerateModalVisible(false);
                  generateForm.resetFields();
                }}
              >
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="账单详情"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={null}
        width={950}
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
                <Tag color={BILL_STATUS_MAP[selectedBill.status].color}>
                  {BILL_STATUS_MAP[selectedBill.status].text}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="商户">
                {selectedBill.merchant_name}
              </Descriptions.Item>
              <Descriptions.Item label="公司">
                {selectedBill.merchant_company}
              </Descriptions.Item>
              <Descriptions.Item label="账期">
                {selectedBill.billing_period}
              </Descriptions.Item>
              <Descriptions.Item label="总金额">
                <Text strong style={{ color: "#f5222d", fontSize: 18 }}>
                  ¥{selectedBill.total_amount.toFixed(2)}
                </Text>
                {selectedBill.adjusted_amount > 0 && (
                  <Text
                    type="secondary"
                    style={{ fontSize: 12, marginLeft: 8 }}
                  >
                    (原金额 ¥
                    {(
                      selectedBill.total_amount + selectedBill.adjusted_amount
                    ).toFixed(2)}
                    ，已减免 ¥{selectedBill.adjusted_amount.toFixed(2)})
                  </Text>
                )}
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
                    totalAmount += amount;
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

            {selectedBill.dispute_status && (
              <Card
                size="small"
                title={
                  <Space>
                    <QuestionCircleOutlined />
                    申诉记录
                    <Tag
                      color={
                        DISPUTE_STATUS_MAP[selectedBill.dispute_status]?.color
                      }
                    >
                      {DISPUTE_STATUS_MAP[selectedBill.dispute_status]?.text}
                    </Tag>
                  </Space>
                }
                style={{
                  marginBottom: 16,
                  background: "#fffbe6",
                  borderColor: "#ffe58f",
                }}
              >
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="申诉理由">
                    {selectedBill.dispute_reason}
                  </Descriptions.Item>
                  <Descriptions.Item label="申诉时间">
                    {selectedBill.dispute_created_at
                      ? dayjs(selectedBill.dispute_created_at).format(
                          "YYYY-MM-DD HH:mm",
                        )
                      : "-"}
                  </Descriptions.Item>
                  {selectedBill.dispute_admin_note && (
                    <Descriptions.Item label="管理员回复">
                      <Text type="secondary">
                        {selectedBill.dispute_admin_note}
                      </Text>
                    </Descriptions.Item>
                  )}
                  {selectedBill.dispute_adjustment_amount > 0 && (
                    <Descriptions.Item label="调整减免">
                      <Text strong style={{ color: "#52c41a" }}>
                        ¥{selectedBill.dispute_adjustment_amount.toFixed(2)}
                      </Text>
                    </Descriptions.Item>
                  )}
                  {selectedBill.dispute_adjustment_reason && (
                    <Descriptions.Item label="调整说明">
                      {selectedBill.dispute_adjustment_reason}
                    </Descriptions.Item>
                  )}
                  {selectedBill.dispute_resolved_at && (
                    <Descriptions.Item label="处理时间">
                      {dayjs(selectedBill.dispute_resolved_at).format(
                        "YYYY-MM-DD HH:mm",
                      )}
                      {selectedBill.resolved_by_name
                        ? ` (${selectedBill.resolved_by_name})`
                        : ""}
                    </Descriptions.Item>
                  )}
                </Descriptions>
              </Card>
            )}

            <div style={{ marginTop: 16, textAlign: "right" }}>
              <Space>
                <Button icon={<DownloadOutlined />}>下载账单</Button>
                {selectedBill.dispute_status === "pending" && (
                  <Button
                    style={{ color: "#fa8c16" }}
                    icon={<QuestionCircleOutlined />}
                    onClick={() => {
                      setDetailModalVisible(false);
                      handleViewDispute({
                        id: selectedBill.dispute_id,
                        bill_id: selectedBill.id,
                      });
                    }}
                  >
                    处理申诉
                  </Button>
                )}
                {(selectedBill.status === "issued" ||
                  selectedBill.status === "overdue" ||
                  selectedBill.status === "dispute_rejected" ||
                  selectedBill.status === "adjusted") && (
                  <Button
                    type="primary"
                    icon={<CheckCircleOutlined />}
                    onClick={() => {
                      handleMarkPaid(selectedBill.id);
                      setDetailModalVisible(false);
                    }}
                  >
                    标记已支付
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
        title={
          selectedDispute?.status === "pending" ? "处理账单申诉" : "申诉详情"
        }
        open={disputeModalVisible}
        onCancel={() => setDisputeModalVisible(false)}
        footer={selectedDispute?.status === "pending" ? null : null}
        width={650}
      >
        {selectedDispute && (
          <div>
            <Descriptions
              bordered
              column={2}
              size="small"
              style={{ marginBottom: 16 }}
            >
              <Descriptions.Item label="账单编号">
                {selectedDispute.bill_no}
              </Descriptions.Item>
              <Descriptions.Item label="申诉状态">
                <Tag color={DISPUTE_STATUS_MAP[selectedDispute.status]?.color}>
                  {DISPUTE_STATUS_MAP[selectedDispute.status]?.text}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="商户">
                {selectedDispute.merchant_name} (
                {selectedDispute.merchant_company})
              </Descriptions.Item>
              <Descriptions.Item label="账期">
                {selectedDispute.billing_period}
              </Descriptions.Item>
              <Descriptions.Item label="账单金额" span={2}>
                <Text strong style={{ color: "#f5222d" }}>
                  ¥{selectedDispute.bill_total_amount?.toFixed(2)}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="申诉理由" span={2}>
                <Text>{selectedDispute.reason}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="申诉时间" span={2}>
                {dayjs(selectedDispute.created_at).format("YYYY-MM-DD HH:mm")}
              </Descriptions.Item>
              {selectedDispute.admin_note && (
                <Descriptions.Item label="驳回理由" span={2}>
                  <Text type="secondary">{selectedDispute.admin_note}</Text>
                </Descriptions.Item>
              )}
              {selectedDispute.adjustment_amount > 0 && (
                <>
                  <Descriptions.Item label="调整减免">
                    <Text strong style={{ color: "#52c41a" }}>
                      ¥{selectedDispute.adjustment_amount.toFixed(2)}
                    </Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="调整后金额">
                    <Text strong>
                      ¥
                      {(
                        selectedDispute.bill_total_amount -
                        selectedDispute.adjustment_amount
                      ).toFixed(2)}
                    </Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="调整说明" span={2}>
                    {selectedDispute.adjustment_reason}
                  </Descriptions.Item>
                </>
              )}
              {selectedDispute.resolved_at && (
                <Descriptions.Item label="处理时间" span={2}>
                  {dayjs(selectedDispute.resolved_at).format(
                    "YYYY-MM-DD HH:mm",
                  )}
                  {selectedDispute.resolved_by_name
                    ? ` (${selectedDispute.resolved_by_name})`
                    : ""}
                </Descriptions.Item>
              )}
            </Descriptions>

            {selectedDispute.status === "pending" ? (
              <Form form={disputeForm} layout="vertical">
                <Divider>审核操作</Divider>
                <Alert
                  message="请选择处理方式"
                  description="驳回：申诉理由不成立，账单恢复原状态；调整：确认减免部分金额，将生成红字调整明细。"
                  type="info"
                  showIcon
                  style={{ marginBottom: 16 }}
                />
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item name="adminNote" label="驳回理由（驳回时填写）">
                      <TextArea rows={2} placeholder="如驳回，请填写理由" />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      name="adjustmentAmount"
                      label="调整减免金额"
                      rules={[
                        {
                          type: "number",
                          min: 0,
                          message: "减免金额不能为负数",
                        },
                      ]}
                    >
                      <InputNumber
                        style={{ width: "100%" }}
                        min={0}
                        max={selectedDispute.bill_total_amount}
                        step={10}
                        precision={2}
                        placeholder="减免金额"
                        prefix="¥"
                      />
                    </Form.Item>
                    <Form.Item name="adjustmentReason" label="调整说明">
                      <TextArea rows={2} placeholder="如调整，请说明原因" />
                    </Form.Item>
                  </Col>
                </Row>
                <div style={{ textAlign: "right" }}>
                  <Space>
                    <Button
                      icon={<DislikeOutlined />}
                      onClick={handleRejectDispute}
                    >
                      驳回申诉
                    </Button>
                    <Button
                      type="primary"
                      icon={<EditOutlined />}
                      onClick={handleAdjustDispute}
                    >
                      确认调整
                    </Button>
                    <Button onClick={() => setDisputeModalVisible(false)}>
                      关闭
                    </Button>
                  </Space>
                </div>
              </Form>
            ) : (
              <div style={{ textAlign: "right" }}>
                <Button onClick={() => setDisputeModalVisible(false)}>
                  关闭
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default AdminBills;
