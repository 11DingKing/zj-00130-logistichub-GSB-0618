import { useState, useEffect } from 'react';
import { Card, Table, Tag, Space, Select, Button, Modal, Form, DatePicker, InputNumber, message, Typography, Descriptions, Row, Col, Statistic, Input, Table as AntTable, Alert, Tabs } from 'antd';
import { 
  DollarOutlined, 
  EyeOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  FileTextOutlined,
  PlusOutlined,
  ExclamationCircleOutlined,
  DisconnectOutlined,
  CheckOutlined,
  StopOutlined
} from '@ant-design/icons';
import { billAPI, userAPI, statsAPI } from '../../services/apiEndpoints';
import { useRequest } from '../../hooks/useRequest';
import { BILL_STATUS_MAP, DISPUTE_STATUS_MAP, BILLING_METHOD_MAP } from '../../utils/constants';
import dayjs from 'dayjs';
import ReactECharts from 'echarts-for-react';

const { Text } = Typography;
const { Option } = Select;
const { MonthPicker } = DatePicker;
const { TextArea } = Input;
const { TabPane } = Tabs;

const AdminBills = () => {
  const [filters, setFilters] = useState({ status: '', merchantId: '', billingPeriod: '' });
  const [generateModalVisible, setGenerateModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedBill, setSelectedBill] = useState(null);
  const [generateForm] = Form.useForm();
  const [disputeActionModal, setDisputeActionModal] = useState({ visible: false, action: null, dispute: null });
  const [disputeForm] = Form.useForm();

  const { data: bills, loading, run: fetchBills } = useRequest(
    () => billAPI.getAll(filters)
  );

  const { data: summary, loading: summaryLoading, run: fetchSummary } = useRequest(
    () => billAPI.getSummary()
  );

  const { data: incomeTrend, run: fetchIncomeTrend } = useRequest(
    () => statsAPI.getIncomeTrend({ months: 12 })
  );

  const { data: merchants } = useRequest(
    () => userAPI.getMerchants()
  );

  useEffect(() => {
    fetchBills();
  }, [filters, fetchBills]);

  const handleGenerateBills = async (values) => {
    try {
      const year = values.month.year();
      const month = values.month.month() + 1;
      const response = await billAPI.generateMonthly({ 
        year, 
        month, 
        force: values.force || false 
      });
      message.success(response.data.message);
      setGenerateModalVisible(false);
      generateForm.resetFields();
      fetchBills();
      fetchSummary();
      fetchIncomeTrend();
    } catch (err) {
      message.error(err.response?.data?.error || '生成账单失败');
    }
  };

  const handleViewDetail = async (id) => {
    try {
      const response = await billAPI.getById(id);
      setSelectedBill(response.data);
      setDetailModalVisible(true);
    } catch (err) {
      message.error('获取账单详情失败');
    }
  };

  const handleMarkPaid = async (id) => {
    Modal.confirm({
      title: '确认标记为已支付',
      icon: <CheckCircleOutlined />,
      content: '确认此账单已收到款项？',
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
          message.error(err.response?.data?.error || '操作失败');
        }
      }
    });
  };

  const handleMarkOverdue = async (id) => {
    Modal.confirm({
      title: '确认标记为逾期',
      icon: <WarningOutlined />,
      content: '确认此账单已逾期？',
      onOk: async () => {
        try {
          const response = await billAPI.markOverdue(id);
          message.success(response.data.message);
          fetchBills();
          fetchSummary();
        } catch (err) {
          message.error(err.response?.data?.error || '操作失败');
        }
      }
    });
  };

  const openDisputeAction = (action, dispute) => {
    disputeForm.resetFields();
    setDisputeActionModal({ visible: true, action, dispute });
  };

  const handleDisputeAction = async (values) => {
    const { action, dispute } = disputeActionModal;
    try {
      if (action === 'reject') {
        await billAPI.rejectDispute(selectedBill.id, dispute.id, { admin_notes: values.admin_notes });
        message.success('申诉已驳回');
      } else if (action === 'approve') {
        await billAPI.approveDispute(selectedBill.id, dispute.id, { 
          adjustment_amount: values.adjustment_amount,
          admin_notes: values.admin_notes 
        });
        message.success('申诉已通过，已生成调整明细');
      }
      setDisputeActionModal({ visible: false, action: null, dispute: null });
      fetchBills();
      fetchSummary();
      if (selectedBill) {
        const response = await billAPI.getById(selectedBill.id);
        setSelectedBill(response.data);
      }
    } catch (err) {
      message.error(err.response?.data?.error || '操作失败');
    }
  };

  const getChartOption = () => {
    if (!incomeTrend?.trends) return {};
    
    const months = incomeTrend.trends.map(t => t.month);
    const totalIncome = incomeTrend.trends.map(t => t.total_income);
    const receivedIncome = incomeTrend.trends.map(t => t.received_income);

    return {
      tooltip: { trigger: 'axis' },
      legend: { data: ['总营收', '已收款'] },
      xAxis: {
        type: 'category',
        data: months
      },
      yAxis: { 
        type: 'value',
        axisLabel: { formatter: '{value} 元' }
      },
      series: [
        {
          name: '总营收',
          type: 'bar',
          data: totalIncome,
          itemStyle: { color: '#1890ff' }
        },
        {
          name: '已收款',
          type: 'bar',
          data: receivedIncome,
          itemStyle: { color: '#52c41a' }
        }
      ]
    };
  };

  const columns = [
    {
      title: '账单编号',
      dataIndex: 'bill_no',
      width: 180,
      render: (text) => <Text strong>{text}</Text>
    },
    {
      title: '商户',
      dataIndex: 'merchant_name',
      width: 120
    },
    {
      title: '账期',
      dataIndex: 'billing_period',
      width: 100
    },
    {
      title: '金额',
      dataIndex: 'total_amount',
      width: 120,
      render: (val) => <Text strong style={{ color: '#f5222d' }}>¥{val.toFixed(2)}</Text>
    },
    {
      title: '明细项',
      dataIndex: 'item_count',
      width: 80
    },
    {
      title: '账单状态',
      dataIndex: 'status',
      width: 100,
      render: (val) => {
        const status = BILL_STATUS_MAP[val];
        return <Tag color={status.color}>{status.text}</Tag>;
      }
    },
    {
      title: '争议状态',
      dataIndex: 'dispute_status_info',
      width: 100,
      render: (val, record) => {
        const disputeStatus = val || record.dispute_status || 'none';
        const status = DISPUTE_STATUS_MAP[disputeStatus];
        if (disputeStatus === 'none') return '-';
        return <Tag color={status.color}>{status.text}</Tag>;
      }
    },
    {
      title: '出单时间',
      dataIndex: 'issued_at',
      width: 160,
      render: (val) => val ? dayjs(val).format('YYYY-MM-DD HH:mm') : '-'
    },
    {
      title: '操作',
      key: 'action',
      width: 260,
      fixed: 'right',
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
          {(record.status === 'issued' || record.status === 'overdue' || record.status === 'adjusted') && (
            <Button
              type="link"
              size="small"
              icon={<CheckCircleOutlined />}
              onClick={() => handleMarkPaid(record.id)}
            >
              标记支付
            </Button>
          )}
          {record.status === 'issued' && (
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
        </Space>
      )
    }
  ];

  const itemColumns = [
    {
      title: '库位',
      dataIndex: 'location_code',
      width: 100
    },
    {
      title: '货品',
      dataIndex: 'category_name',
      width: 120
    },
    {
      title: '计费方式',
      dataIndex: 'billing_method',
      width: 120,
      render: (val) => BILLING_METHOD_MAP[val]
    },
    {
      title: '单价',
      dataIndex: 'unit_price',
      width: 120,
      render: (val, record) => record.billing_method === 'adjustment' ? '-' : `¥${val.toFixed(2)}/${record.billing_method === 'monthly' ? '月' : record.billing_method === 'daily' ? '天' : record.category_unit || '单位'}`
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      width: 100,
      render: (val, record) => record.billing_method === 'adjustment' ? '-' : `${val} ${record.category_unit || ''}`
    },
    {
      title: '天数',
      dataIndex: 'days',
      width: 80,
      render: (val, record) => record.billing_method === 'adjustment' ? '-' : val
    },
    {
      title: '金额',
      dataIndex: 'amount',
      width: 100,
      render: (val) => <Text strong style={{ color: val < 0 ? '#52c41a' : '#f5222d' }}>{val < 0 ? '-' : ''}¥{Math.abs(val).toFixed(2)}</Text>
    },
    {
      title: '说明',
      dataIndex: 'description'
    }
  ];

  const disputeColumns = [
    {
      title: '申诉时间',
      dataIndex: 'submitted_at',
      width: 160,
      render: (val) => dayjs(val).format('YYYY-MM-DD HH:mm')
    },
    {
      title: '商户',
      dataIndex: 'merchant_name',
      width: 120
    },
    {
      title: '申诉理由',
      dataIndex: 'reason'
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (val) => {
        const status = DISPUTE_STATUS_MAP[val];
        return <Tag color={status.color}>{status.text}</Tag>;
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_, record) => (
        record.status === 'pending' && selectedBill && (
          <Space>
            <Button
              type="link"
              size="small"
              icon={<CheckOutlined />}
              onClick={() => openDisputeAction('approve', record)}
            >
              通过并调整
            </Button>
            <Button
              type="link"
              size="small"
              danger
              icon={<StopOutlined />}
              onClick={() => openDisputeAction('reject', record)}
            >
              驳回
            </Button>
          </Space>
        )
      )
    }
  ];

  const pendingDisputesCount = bills?.filter(b => b.dispute_status_info === 'pending').length || 0;

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
              valueStyle={{ color: '#1890ff' }}
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
              valueStyle={{ color: '#52c41a' }}
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
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="待处理申诉"
              value={pendingDisputesCount}
              prefix={<DisconnectOutlined />}
              valueStyle={{ color: pendingDisputesCount > 0 ? '#f5222d' : '#8c8c8c' }}
            />
          </Card>
        </Col>
      </Row>

      <Card title="营收趋势" style={{ marginBottom: 16 }}>
        <ReactECharts option={getChartOption()} style={{ height: 300 }} />
      </Card>

      {pendingDisputesCount > 0 && (
        <Alert
          message={`有 ${pendingDisputesCount} 张账单存在待处理的商户申诉，请及时审核`}
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          action={
            <Button size="small" type="primary" onClick={() => setFilters({ ...filters, status: '' })}>
              查看全部
            </Button>
          }
        />
      )}

      <Card>
        <Space style={{ marginBottom: 16 }} wrap>
          <Select
            placeholder="选择状态"
            style={{ width: 150 }}
            allowClear
            value={filters.status || undefined}
            onChange={(val) => setFilters({ ...filters, status: val || '' })}
          >
            {Object.entries(BILL_STATUS_MAP).map(([key, val]) => (
              <Option key={key} value={key}>{val.text}</Option>
            ))}
          </Select>
          <Select
            placeholder="选择商户"
            style={{ width: 180 }}
            allowClear
            showSearch
            optionFilterProp="children"
            value={filters.merchantId || undefined}
            onChange={(val) => setFilters({ ...filters, merchantId: val || '' })}
          >
            {merchants?.map(m => (
              <Option key={m.id} value={m.id}>{m.name} ({m.company_name})</Option>
            ))}
          </Select>
          <Select
            placeholder="选择账期"
            style={{ width: 150 }}
            allowClear
            value={filters.billingPeriod || undefined}
            onChange={(val) => setFilters({ ...filters, billingPeriod: val || '' })}
          >
            {['2026-06', '2026-05', '2026-04', '2026-03', '2026-02', '2026-01'].map(p => (
              <Option key={p} value={p}>{p}</Option>
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
            showTotal: (total) => `共 ${total} 条记录`
          }}
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
            rules={[{ required: true, message: '请选择月份' }]}
          >
            <MonthPicker style={{ width: '100%' }} placeholder="选择月份" />
          </Form.Item>
          <Form.Item
            name="force"
            valuePropName="checked"
          >
            <Select placeholder="如该月账单已存在">
              <Option value={false}>跳过已生成的商户</Option>
              <Option value={true}>覆盖重新生成</Option>
            </Select>
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">生成账单</Button>
              <Button onClick={() => {
                setGenerateModalVisible(false);
                generateForm.resetFields();
              }}>
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
        width={1100}
      >
        {selectedBill && (
          <div>
            <Descriptions bordered column={2} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="账单编号">{selectedBill.bill_no}</Descriptions.Item>
              <Descriptions.Item label="账单状态">
                <Tag color={BILL_STATUS_MAP[selectedBill.status].color}>
                  {BILL_STATUS_MAP[selectedBill.status].text}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="争议状态">
                <Tag color={DISPUTE_STATUS_MAP[selectedBill.dispute_status || 'none'].color}>
                  {DISPUTE_STATUS_MAP[selectedBill.dispute_status || 'none'].text}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="商户">{selectedBill.merchant_name} / {selectedBill.merchant_company}</Descriptions.Item>
              <Descriptions.Item label="账期">{selectedBill.billing_period}</Descriptions.Item>
              <Descriptions.Item label="原始金额">¥{selectedBill.total_amount.toFixed(2)}</Descriptions.Item>
              <Descriptions.Item label="调整金额">
                {selectedBill.adjusted_amount ? <Text style={{ color: '#52c41a' }}>-¥{selectedBill.adjusted_amount.toFixed(2)}</Text> : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="最终应收金额" span={2}>
                <Text strong style={{ color: '#f5222d', fontSize: 18 }}>
                  ¥{(selectedBill.final_amount || selectedBill.total_amount).toFixed(2)}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="出单时间">
                {selectedBill.issued_at ? dayjs(selectedBill.issued_at).format('YYYY-MM-DD HH:mm') : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="支付时间">
                {selectedBill.paid_at ? dayjs(selectedBill.paid_at).format('YYYY-MM-DD HH:mm') : '-'}
              </Descriptions.Item>
            </Descriptions>

            <Tabs defaultActiveKey="items">
              <TabPane tab="账单明细" key="items">
                <Card size="small">
                  <AntTable
                    columns={itemColumns}
                    dataSource={[...selectedBill.items, ...(selectedBill.adjustmentItems || [])]}
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
                              <Text strong>合计（最终应收）</Text>
                            </AntTable.Summary.Cell>
                            <AntTable.Summary.Cell index={6}>
                              <Text strong style={{ color: '#f5222d' }}>¥{(selectedBill.final_amount || selectedBill.total_amount).toFixed(2)}</Text>
                            </AntTable.Summary.Cell>
                            <AntTable.Summary.Cell index={7}></AntTable.Summary.Cell>
                          </AntTable.Summary.Row>
                        </AntTable.Summary>
                      );
                    }}
                  />
                </Card>
              </TabPane>
              <TabPane tab={`申诉记录 (${selectedBill.disputes?.length || 0})`} key="disputes">
                {selectedBill.disputes && selectedBill.disputes.length > 0 ? (
                  <Table
                    columns={disputeColumns}
                    dataSource={selectedBill.disputes}
                    rowKey="id"
                    size="small"
                    pagination={false}
                  />
                ) : (
                  <Alert message="暂无申诉记录" type="info" showIcon />
                )}
              </TabPane>
            </Tabs>

            <div style={{ marginTop: 16, textAlign: 'right' }}>
              <Space>
                {(selectedBill.status === 'issued' || selectedBill.status === 'overdue' || selectedBill.status === 'adjusted') && (
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
                <Button onClick={() => setDetailModalVisible(false)}>关闭</Button>
              </Space>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        title={disputeActionModal.action === 'approve' ? '审核通过并调整金额' : '驳回申诉'}
        open={disputeActionModal.visible}
        onCancel={() => setDisputeActionModal({ visible: false, action: null, dispute: null })}
        footer={null}
        width={500}
      >
        {disputeActionModal.dispute && (
          <div>
            <Alert
              message="商户申诉理由"
              description={disputeActionModal.dispute.reason}
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
            <Form
              form={disputeForm}
              layout="vertical"
              onFinish={handleDisputeAction}
            >
              {disputeActionModal.action === 'approve' && (
                <Form.Item
                  name="adjustment_amount"
                  label="调整金额（元）"
                  rules={[{ required: true, message: '请输入调整金额', type: 'number', min: 0.01 }]}
                  tooltip="将从账单总金额中扣除该金额，生成红字调整明细"
                >
                  <InputNumber
                    style={{ width: '100%' }}
                    placeholder="请输入调整金额"
                    min={0.01}
                    max={selectedBill?.total_amount || 0}
                    step={1}
                    precision={2}
                    prefix="¥"
                  />
                </Form.Item>
              )}
              <Form.Item
                name="admin_notes"
                label={disputeActionModal.action === 'approve' ? '调整说明' : '驳回理由'}
                rules={[{ required: true, message: '请填写备注说明' }]}
              >
                <TextArea rows={3} placeholder={disputeActionModal.action === 'approve' ? '请说明调整原因...' : '请说明驳回原因...'} maxLength={300} showCount />
              </Form.Item>
              <Form.Item>
                <Space>
                  <Button type="primary" htmlType="submit">
                    {disputeActionModal.action === 'approve' ? '确认通过并调整' : '确认驳回'}
                  </Button>
                  <Button onClick={() => setDisputeActionModal({ visible: false, action: null, dispute: null })}>
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
