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
  DatePicker,
  message,
  Typography,
  Descriptions,
  Row,
  Col,
  Statistic,
  InputNumber,
  Table as AntTable,
  Tabs,
  Timeline,
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
  StopOutlined,
} from "@ant-design/icons";
import { billAPI, userAPI, statsAPI } from "../../services/apiEndpoints";
import { useRequest } from "../../hooks/useRequest";
import dayjs from "dayjs";
import ReactECharts from "echarts-for-react";

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { MonthPicker } = DatePicker;
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

const AdminBills = () => {
  const [filters, setFilters] = useState({
    status: "",
    merchantId: "",
    billingPeriod: "",
  });
  const [generateModalVisible, setGenerateModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedBill, setSelectedBill] = useState(null);
  const [generateForm] = Form.useForm();
  const [activeTab, setActiveTab] = useState("bills");
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [reviewMode, setReviewMode] = useState("approve");
  const [selectedDispute, setSelectedDispute] = useState(null);
  const [reviewForm] = Form.useForm();

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

  const { data: merchants } = useRequest(() => userAPI.getMerchants());

  const {
    data: disputes,
    loading: disputesLoading,
    run: fetchDisputes,
  } = useRequest(() => billAPI.getAllDisputes());

  useEffect(() => {
    fetchBills();
  }, [filters, fetchBills]);

  useEffect(() => {
    fetchDisputes();
  }, [fetchDisputes]);

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
        } catch (err) {
          message.error(err.response?.data?.error || "取消失败");
        }
      },
    });
  };

  const handleOpenReview = (dispute, mode) => {
    setSelectedDispute(dispute);
    setReviewMode(mode);
    reviewForm.resetFields();
    if (
      mode === "approve" &&
      dispute.expected_amount != null &&
      dispute.bill_total_amount != null
    ) {
      const suggested =
        Math.round(
          (Number(dispute.expected_amount) -
            Number(dispute.bill_total_amount)) *
            100,
        ) / 100;
      reviewForm.setFieldsValue({ adjustmentAmount: suggested });
    }
    setReviewModalVisible(true);
  };

  const handleSubmitReview = async (values) => {
    try {
      let response;
      if (reviewMode === "reject") {
        response = await billAPI.rejectDispute(selectedDispute.id, {
          adminResponse: values.adminResponse,
        });
      } else {
        response = await billAPI.approveDispute(selectedDispute.id, {
          adminResponse: values.adminResponse,
          adjustmentAmount: values.adjustmentAmount,
          description: values.description,
        });
      }
      message.success(response.data.message);
      setReviewModalVisible(false);
      reviewForm.resetFields();
      fetchBills();
      fetchSummary();
      fetchDisputes();
      if (detailModalVisible && selectedBill) {
        const refresh = await billAPI.getById(selectedBill.id);
        setSelectedBill(refresh.data);
      }
    } catch (err) {
      message.error(err.response?.data?.error || "操作失败");
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
      render: (text) => <Text strong>{text}</Text>,
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
      render: (val) => (
        <Text strong style={{ color: "#f5222d" }}>
          ¥{val.toFixed(2)}
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
      width: 130,
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
      width: 220,
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
          {(record.status === "issued" ||
            record.status === "overdue" ||
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
          {record.status === "issued" && (
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
          {(record.status === "issued" || record.status === "overdue") && (
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
              title="回款率"
              value={summary?.summary?.collectionRate || 0}
              precision={2}
              suffix="%"
              valueStyle={{ color: "#722ed1" }}
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
              label: `账单列表${(disputes?.filter((d) => d.status === "pending").length || 0) > 0 ? ` (申诉待审 ${disputes.filter((d) => d.status === "pending").length})` : ""}`,
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
                    scroll={{ x: 1300 }}
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
              label: `账单申诉${(disputes?.filter((d) => d.status === "pending").length || 0) > 0 ? ` (${disputes.filter((d) => d.status === "pending").length})` : ""}`,
              children: (
                <Table
                  loading={disputesLoading}
                  rowKey="id"
                  dataSource={disputes}
                  scroll={{ x: 1400 }}
                  pagination={{ pageSize: 10, showSizeChanger: true }}
                  columns={[
                    { title: "账单编号", dataIndex: "bill_no", width: 180 },
                    { title: "账期", dataIndex: "billing_period", width: 100 },
                    {
                      title: "商户",
                      dataIndex: "merchant_name",
                      width: 120,
                      render: (v, r) =>
                        `${v}${r.merchant_company ? " / " + r.merchant_company : ""}`,
                    },
                    {
                      title: "原账单金额",
                      dataIndex: "bill_total_amount",
                      width: 120,
                      render: (v) => `¥${Number(v).toFixed(2)}`,
                    },
                    {
                      title: "期望金额",
                      dataIndex: "expected_amount",
                      width: 120,
                      render: (v) =>
                        v != null ? `¥${Number(v).toFixed(2)}` : "-",
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
                          <Text
                            style={{ color: v < 0 ? "#52c41a" : "#f5222d" }}
                          >
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
                      render: (v) => v || "-",
                    },
                    {
                      title: "提交时间",
                      dataIndex: "created_at",
                      width: 150,
                      render: (v) =>
                        v ? dayjs(v).format("YYYY-MM-DD HH:mm") : "-",
                    },
                    {
                      title: "操作",
                      key: "action",
                      width: 200,
                      fixed: "right",
                      render: (_, record) =>
                        record.status === "pending" ? (
                          <Space>
                            <Button
                              type="link"
                              size="small"
                              icon={<CheckCircleOutlined />}
                              onClick={() =>
                                handleOpenReview(record, "approve")
                              }
                            >
                              批准并调整
                            </Button>
                            <Button
                              type="link"
                              size="small"
                              danger
                              icon={<StopOutlined />}
                              onClick={() => handleOpenReview(record, "reject")}
                            >
                              驳回
                            </Button>
                          </Space>
                        ) : (
                          <Text type="secondary">已处理</Text>
                        ),
                    },
                  ]}
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
        width={900}
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
                      d.status === "approved"
                        ? "green"
                        : d.status === "rejected"
                          ? "red"
                          : "orange",
                    children: (
                      <div>
                        <Space>
                          <Tag color={DISPUTE_STATUS_MAP[d.status].color}>
                            {DISPUTE_STATUS_MAP[d.status].text}
                          </Tag>
                          <Text type="secondary">
                            {dayjs(d.created_at).format("YYYY-MM-DD HH:mm")}
                          </Text>
                          {d.merchant_name && (
                            <Text type="secondary">
                              来自：{d.merchant_name}
                            </Text>
                          )}
                        </Space>
                        <Paragraph style={{ marginTop: 4, marginBottom: 4 }}>
                          <Text strong>申诉理由：</Text>
                          {d.reason}
                        </Paragraph>
                        {d.expected_amount != null && (
                          <Paragraph style={{ marginBottom: 4 }}>
                            <Text strong>商户期望金额：</Text>¥
                            {Number(d.expected_amount).toFixed(2)}
                          </Paragraph>
                        )}
                        {d.admin_response && (
                          <Paragraph style={{ marginBottom: 4 }}>
                            <Text strong>审核意见：</Text>
                            {d.admin_response}
                          </Paragraph>
                        )}
                        {d.adjustment_amount != null && (
                          <Paragraph style={{ marginBottom: 4 }}>
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
                        {d.status === "pending" && (
                          <Space style={{ marginTop: 8 }}>
                            <Button
                              type="primary"
                              size="small"
                              icon={<CheckCircleOutlined />}
                              onClick={() => handleOpenReview(d, "approve")}
                            >
                              批准并调整
                            </Button>
                            <Button
                              size="small"
                              danger
                              icon={<StopOutlined />}
                              onClick={() => handleOpenReview(d, "reject")}
                            >
                              驳回
                            </Button>
                          </Space>
                        )}
                      </div>
                    ),
                  }))}
                />
              </Card>
            )}

            <div style={{ marginTop: 16, textAlign: "right" }}>
              <Space>
                <Button icon={<DownloadOutlined />}>下载账单</Button>
                {(selectedBill.status === "issued" ||
                  selectedBill.status === "overdue" ||
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
        title={reviewMode === "approve" ? "批准申诉并生成红字调整" : "驳回申诉"}
        open={reviewModalVisible}
        onCancel={() => {
          setReviewModalVisible(false);
          reviewForm.resetFields();
        }}
        footer={null}
        width={560}
        destroyOnClose
      >
        {selectedDispute && (
          <div>
            <Descriptions
              size="small"
              bordered
              column={1}
              style={{ marginBottom: 16 }}
            >
              <Descriptions.Item label="账单">
                {selectedDispute.bill_no}（{selectedDispute.billing_period}）
              </Descriptions.Item>
              <Descriptions.Item label="商户">
                {selectedDispute.merchant_name}
              </Descriptions.Item>
              <Descriptions.Item label="原账单金额">
                ¥{Number(selectedDispute.bill_total_amount).toFixed(2)}
              </Descriptions.Item>
              {selectedDispute.expected_amount != null && (
                <Descriptions.Item label="商户期望金额">
                  ¥{Number(selectedDispute.expected_amount).toFixed(2)}
                </Descriptions.Item>
              )}
              <Descriptions.Item label="申诉理由">
                {selectedDispute.reason}
              </Descriptions.Item>
            </Descriptions>
            <Form
              form={reviewForm}
              layout="vertical"
              onFinish={handleSubmitReview}
            >
              {reviewMode === "approve" && (
                <>
                  <Form.Item
                    name="adjustmentAmount"
                    label="红字调整金额（负数表示减免，正数表示补收）"
                    rules={[{ required: true, message: "请填写调整金额" }]}
                    extra="将作为一条 adjustment 类型的明细写入账单，并把账单状态改为已调整"
                  >
                    <InputNumber
                      style={{ width: "100%" }}
                      prefix="¥"
                      precision={2}
                      placeholder="例如：-200.00 表示减免 200 元"
                    />
                  </Form.Item>
                  <Form.Item name="description" label="调整明细描述（可选）">
                    <Input placeholder="默认：红字调整 - 申诉 #ID 处理结果" />
                  </Form.Item>
                </>
              )}
              <Form.Item
                name="adminResponse"
                label={reviewMode === "approve" ? "审核意见" : "驳回理由"}
                rules={[
                  { required: true, message: "请填写" },
                  { min: 3, message: "至少 3 个字符" },
                ]}
              >
                <TextArea
                  rows={3}
                  placeholder={
                    reviewMode === "approve"
                      ? "说明本次调整的依据"
                      : "说明驳回原因，告知商户"
                  }
                />
              </Form.Item>
              <Form.Item>
                <Space>
                  <Button
                    type="primary"
                    danger={reviewMode === "reject"}
                    htmlType="submit"
                  >
                    {reviewMode === "approve" ? "确认批准" : "确认驳回"}
                  </Button>
                  <Button
                    onClick={() => {
                      setReviewModalVisible(false);
                      reviewForm.resetFields();
                    }}
                  >
                    取消
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default AdminBills;
