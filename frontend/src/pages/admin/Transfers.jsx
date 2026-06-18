import { useState, useEffect } from 'react';
import { Card, Table, Tag, Space, Select, Button, Modal, Form, InputNumber, Input, message, Typography, Descriptions, Row, Col, Statistic, Radio, Alert } from 'antd';
import { 
  SwapOutlined, 
  SearchOutlined, 
  EyeOutlined,
  CheckOutlined,
  CloseOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ExclamationCircleOutlined,
  ArrowRightOutlined
} from '@ant-design/icons';
import { transferAPI, inventoryAPI, locationAPI } from '../../services/apiEndpoints';
import { useRequest } from '../../hooks/useRequest';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

const TRANSFER_STATUS_MAP = {
  pending: { text: '待处理', color: 'orange' },
  processing: { text: '处理中', color: 'blue' },
  completed: { text: '已完成', color: 'green' },
  cancelled: { text: '已取消', color: 'default' }
};

const TRANSFER_TYPE_MAP = {
  full: '整批移库',
  partial: '拆批移库'
};

const AdminTransfers = () => {
  const [filters, setFilters] = useState({ status: '', merchantId: '' });
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState(null);
  const [form] = Form.useForm();
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [availableLocations, setAvailableLocations] = useState([]);
  const [loadingLocations, setLoadingLocations] = useState(false);

  const { data: transfers, loading, run: fetchTransfers } = useRequest(
    () => transferAPI.getAll(filters)
  );

  const { data: merchants } = useRequest(
    () => import('../../services/apiEndpoints').then(m => m.userAPI.getMerchants())
  );

  const { data: inventory, loading: inventoryLoading } = useRequest(
    () => inventoryAPI.getAll()
  );

  useEffect(() => {
    fetchTransfers();
  }, [filters, fetchTransfers]);

  useEffect(() => {
    if (selectedBatch) {
      loadAvailableLocations(selectedBatch);
    }
  }, [selectedBatch]);

  const loadAvailableLocations = async (batchId) => {
    setLoadingLocations(true);
    try {
      const response = await transferAPI.getAvailableLocations({ batchId });
      setAvailableLocations(response.data);
    } catch (err) {
      message.error('获取可移库库位失败');
    } finally {
      setLoadingLocations(false);
    }
  };

  const handleBatchChange = (batchId) => {
    const batch = inventory?.find(b => b.id === batchId);
    setSelectedBatch(batch);
    if (batch) {
      form.setFieldsValue({
        quantity: batch.quantity,
        transferType: 'full'
      });
    }
  };

  const handleTransferTypeChange = (e) => {
    const type = e.target.value;
    if (type === 'full' && selectedBatch) {
      form.setFieldsValue({ quantity: selectedBatch.quantity });
    }
  };

  const handleCreateTransfer = async (values) => {
    try {
      const response = await transferAPI.create(values);
      message.success(response.data.message);
      setCreateModalVisible(false);
      form.resetFields();
      setSelectedBatch(null);
      setAvailableLocations([]);
      fetchTransfers();
    } catch (err) {
      message.error(err.response?.data?.error || '创建移库单失败');
    }
  };

  const handleViewDetail = async (id) => {
    try {
      const response = await transferAPI.getById(id);
      setSelectedTransfer(response.data);
      setDetailModalVisible(true);
    } catch (err) {
      message.error('获取移库单详情失败');
    }
  };

  const handleProcessTransfer = async (id) => {
    try {
      const response = await transferAPI.process(id);
      message.success(response.data.message);
      fetchTransfers();
    } catch (err) {
      message.error(err.response?.data?.error || '处理移库单失败');
    }
  };

  const handleCompleteTransfer = async (id) => {
    Modal.confirm({
      title: '确认完成移库',
      icon: <ExclamationCircleOutlined />,
      content: '确认后将调整库位库存，此操作不可撤销。',
      onOk: async () => {
        try {
          const response = await transferAPI.complete(id);
          message.success(response.data.message);
          fetchTransfers();
          if (selectedTransfer?.id === id) {
            const detailResponse = await transferAPI.getById(id);
            setSelectedTransfer(detailResponse.data);
          }
        } catch (err) {
          message.error(err.response?.data?.error || '完成移库失败');
        }
      }
    });
  };

  const handleCancelTransfer = async (id) => {
    Modal.confirm({
      title: '确认取消移库',
      icon: <ExclamationCircleOutlined />,
      content: '确定要取消此移库单吗？',
      onOk: async () => {
        try {
          const response = await transferAPI.cancel(id);
          message.success(response.data.message);
          fetchTransfers();
        } catch (err) {
          message.error(err.response?.data?.error || '取消移库失败');
        }
      }
    });
  };

  const getStatistics = () => {
    if (!transfers) return { total: 0, pending: 0, processing: 0, completed: 0 };
    return {
      total: transfers.length,
      pending: transfers.filter(t => t.status === 'pending').length,
      processing: transfers.filter(t => t.status === 'processing').length,
      completed: transfers.filter(t => t.status === 'completed').length
    };
  };

  const stats = getStatistics();

  const columns = [
    {
      title: '移库单号',
      dataIndex: 'transfer_no',
      width: 160,
      render: (text) => <Text strong>{text}</Text>
    },
    {
      title: '商户',
      dataIndex: 'merchant_name',
      width: 120
    },
    {
      title: '批次号',
      dataIndex: 'batch_no',
      width: 150
    },
    {
      title: '货品',
      dataIndex: 'category_name',
      width: 120
    },
    {
      title: '移库路径',
      key: 'path',
      width: 200,
      render: (_, record) => (
        <Space>
          <Tag color="blue">{record.from_location_code}</Tag>
          <ArrowRightOutlined style={{ color: '#999' }} />
          <Tag color="green">{record.to_location_code}</Tag>
        </Space>
      )
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      width: 80,
      render: (val, record) => `${val} ${record.unit}`
    },
    {
      title: '移库类型',
      dataIndex: 'transfer_type',
      width: 100,
      render: (val) => TRANSFER_TYPE_MAP[val]
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (val) => {
        const status = TRANSFER_STATUS_MAP[val];
        return <Tag color={status.color}>{status.text}</Tag>;
      }
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      width: 160,
      render: (val) => dayjs(val).format('YYYY-MM-DD HH:mm')
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
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
          {record.status === 'pending' && (
            <>
              <Button
                type="link"
                size="small"
                icon={<PlayCircleOutlined />}
                onClick={() => handleProcessTransfer(record.id)}
              >
                处理
              </Button>
              <Button
                type="link"
                size="small"
                danger
                icon={<CloseOutlined />}
                onClick={() => handleCancelTransfer(record.id)}
              >
                取消
              </Button>
            </>
          )}
          {record.status === 'processing' && (
            <Button
              type="link"
              size="small"
              icon={<CheckOutlined />}
              onClick={() => handleCompleteTransfer(record.id)}
            >
              完成
            </Button>
          )}
        </Space>
      )
    }
  ];

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="移库单总数"
              value={stats.total}
              prefix={<SwapOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="待处理"
              value={stats.pending}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="处理中"
              value={stats.processing}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="已完成"
              value={stats.completed}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
      </Row>

      <Card>
        <Space style={{ marginBottom: 16 }} wrap>
          <Select
            placeholder="选择状态"
            style={{ width: 150 }}
            allowClear
            value={filters.status || undefined}
            onChange={(val) => setFilters({ ...filters, status: val || '' })}
          >
            {Object.entries(TRANSFER_STATUS_MAP).map(([key, val]) => (
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
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateModalVisible(true)}
          >
            创建移库单
          </Button>
        </Space>

        <Table
          columns={columns}
          dataSource={transfers}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1300 }}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条记录`
          }}
        />
      </Card>

      <Modal
        title="创建移库单"
        open={createModalVisible}
        onCancel={() => {
          setCreateModalVisible(false);
          form.resetFields();
          setSelectedBatch(null);
          setAvailableLocations([]);
        }}
        footer={null}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreateTransfer}
        >
          <Form.Item
            name="batchId"
            label="选择批次"
            rules={[{ required: true, message: '请选择批次' }]}
          >
            <Select
              placeholder="选择要移库的批次"
              showSearch
              optionFilterProp="children"
              loading={inventoryLoading}
              onChange={handleBatchChange}
            >
              {inventory?.filter(b => b.quantity > 0).map(batch => (
                <Option key={batch.id} value={batch.id}>
                  {batch.batch_no} - {batch.category_name} ({batch.quantity} {batch.category_unit})
                  <Tag color="blue" style={{ marginLeft: 8 }}>{batch.location_code}</Tag>
                </Option>
              ))}
            </Select>
          </Form.Item>

          {selectedBatch && (
            <Alert
              message={`批次信息: ${selectedBatch.batch_no} - ${selectedBatch.category_name}`}
              description={`当前库存: ${selectedBatch.quantity} ${selectedBatch.category_unit}, 库位: ${selectedBatch.location_code}`}
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}

          <Form.Item
            name="transferType"
            label="移库类型"
            rules={[{ required: true, message: '请选择移库类型' }]}
          >
            <Radio.Group onChange={handleTransferTypeChange}>
              <Radio value="full">整批移库</Radio>
              <Radio value="partial">拆批移库</Radio>
            </Radio.Group>
          </Form.Item>

          <Form.Item
            name="quantity"
            label="移库数量"
            rules={[{ required: true, message: '请输入移库数量' }]}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={0.01}
              step={0.01}
              max={selectedBatch?.quantity}
              addonAfter={selectedBatch?.category_unit}
            />
          </Form.Item>

          <Form.Item
            name="toLocationId"
            label="目标库位"
            rules={[{ required: true, message: '请选择目标库位' }]}
          >
            <Select
              placeholder="选择目标库位"
              loading={loadingLocations}
              optionFilterProp="children"
            >
              {availableLocations.map(loc => (
                <Option key={loc.id} value={loc.id}>
                  {loc.code} - {loc.warehouse_name}
                  <Tag color="green" style={{ marginLeft: 8 }}>
                    剩余: {loc.available_capacity?.toFixed(2)}
                  </Tag>
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="reason"
            label="移库原因"
          >
            <Select placeholder="选择移库原因">
              <Option value="consolidation">库位整合</Option>
              <Option value="warehouse_vacate">仓库腾空</Option>
              <Option value="optimization">库存优化</Option>
              <Option value="other">其他</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="remarks"
            label="备注"
          >
            <TextArea rows={3} placeholder="填写备注信息" />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">创建移库单</Button>
              <Button onClick={() => {
                setCreateModalVisible(false);
                form.resetFields();
                setSelectedBatch(null);
                setAvailableLocations([]);
              }}>
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="移库单详情"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={null}
        width={700}
      >
        {selectedTransfer && (
          <div>
            <Descriptions bordered column={2} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="移库单号">{selectedTransfer.transfer_no}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={TRANSFER_STATUS_MAP[selectedTransfer.status].color}>
                  {TRANSFER_STATUS_MAP[selectedTransfer.status].text}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="商户">{selectedTransfer.merchant_name}</Descriptions.Item>
              <Descriptions.Item label="移库类型">{TRANSFER_TYPE_MAP[selectedTransfer.transfer_type]}</Descriptions.Item>
              <Descriptions.Item label="批次号">{selectedTransfer.batch_no}</Descriptions.Item>
              <Descriptions.Item label="货品">{selectedTransfer.category_name}</Descriptions.Item>
              <Descriptions.Item label="源库位">{selectedTransfer.from_location_code}</Descriptions.Item>
              <Descriptions.Item label="目标库位">{selectedTransfer.to_location_code}</Descriptions.Item>
              <Descriptions.Item label="移库数量">
                {selectedTransfer.quantity} {selectedTransfer.unit}
              </Descriptions.Item>
              <Descriptions.Item label="操作人">{selectedTransfer.operator_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="创建时间" span={2}>
                {dayjs(selectedTransfer.created_at).format('YYYY-MM-DD HH:mm:ss')}
              </Descriptions.Item>
              {selectedTransfer.completed_at && (
                <Descriptions.Item label="完成时间" span={2}>
                  {dayjs(selectedTransfer.completed_at).format('YYYY-MM-DD HH:mm:ss')}
                </Descriptions.Item>
              )}
              {selectedTransfer.reason && (
                <Descriptions.Item label="移库原因" span={2}>
                  {selectedTransfer.reason === 'consolidation' ? '库位整合' :
                   selectedTransfer.reason === 'warehouse_vacate' ? '仓库腾空' :
                   selectedTransfer.reason === 'optimization' ? '库存优化' : '其他'}
                </Descriptions.Item>
              )}
              {selectedTransfer.remarks && (
                <Descriptions.Item label="备注" span={2}>
                  {selectedTransfer.remarks}
                </Descriptions.Item>
              )}
            </Descriptions>

            {selectedTransfer.fromLocation && selectedTransfer.toLocation && (
              <Card size="small" title="库位信息">
                <Row gutter={16}>
                  <Col span={12}>
                    <Text strong>源库位:</Text>
                    <Descriptions size="small" column={1}>
                      <Descriptions.Item label="编码">
                        {selectedTransfer.fromLocation.code}
                      </Descriptions.Item>
                      <Descriptions.Item label="容量">
                        {selectedTransfer.fromLocation.capacity}
                      </Descriptions.Item>
                      <Descriptions.Item label="已用">
                        {selectedTransfer.fromLocation.used_capacity}
                      </Descriptions.Item>
                      <Descriptions.Item label="温区">
                        {selectedTransfer.fromLocation.temperature_zone}
                      </Descriptions.Item>
                    </Descriptions>
                  </Col>
                  <Col span={12}>
                    <Text strong>目标库位:</Text>
                    <Descriptions size="small" column={1}>
                      <Descriptions.Item label="编码">
                        {selectedTransfer.toLocation.code}
                      </Descriptions.Item>
                      <Descriptions.Item label="容量">
                        {selectedTransfer.toLocation.capacity}
                      </Descriptions.Item>
                      <Descriptions.Item label="已用">
                        {selectedTransfer.toLocation.used_capacity}
                      </Descriptions.Item>
                      <Descriptions.Item label="温区">
                        {selectedTransfer.toLocation.temperature_zone}
                      </Descriptions.Item>
                    </Descriptions>
                  </Col>
                </Row>
              </Card>
            )}

            <div style={{ marginTop: 16, textAlign: 'right' }}>
              <Space>
                {selectedTransfer.status === 'pending' && (
                  <>
                    <Button
                      type="primary"
                      icon={<PlayCircleOutlined />}
                      onClick={() => {
                        handleProcessTransfer(selectedTransfer.id);
                        setDetailModalVisible(false);
                      }}
                    >
                      开始处理
                    </Button>
                    <Button
                      danger
                      icon={<CloseOutlined />}
                      onClick={() => {
                        handleCancelTransfer(selectedTransfer.id);
                        setDetailModalVisible(false);
                      }}
                    >
                      取消移库
                    </Button>
                  </>
                )}
                {selectedTransfer.status === 'processing' && (
                  <Button
                    type="primary"
                    icon={<CheckOutlined />}
                    onClick={() => {
                      handleCompleteTransfer(selectedTransfer.id);
                    }}
                  >
                    完成移库
                  </Button>
                )}
                <Button onClick={() => setDetailModalVisible(false)}>关闭</Button>
              </Space>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default AdminTransfers;
