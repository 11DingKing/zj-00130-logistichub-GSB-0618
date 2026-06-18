import { useState } from 'react';
import { Card, Table, Tag, Space, Select, Button, Modal, Form, message, Typography, Descriptions, List, Alert, Divider } from 'antd';
import { 
  SendOutlined, 
  SearchOutlined, 
  EyeOutlined,
  CheckOutlined,
  RocketOutlined,
  WarningOutlined
} from '@ant-design/icons';
import { outboundAPI } from '../../services/apiEndpoints';
import { useRequest } from '../../hooks/useRequest';
import { STATUS_MAP, INVENTORY_STATUS_MAP } from '../../utils/constants';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

const AdminOutbound = () => {
  const [statusFilter, setStatusFilter] = useState();
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [allocateModalVisible, setAllocateModalVisible] = useState(false);
  const [pickModalVisible, setPickModalVisible] = useState(false);
  const [allocateResult, setAllocateResult] = useState(null);

  const { data: orders, loading, run: fetchOrders } = useRequest(
    () => outboundAPI.getAll({ status: statusFilter })
  );

  const handleViewOrder = async (orderId) => {
    try {
      const response = await outboundAPI.getById(orderId);
      setSelectedOrder(response.data);
      setDetailModalVisible(true);
    } catch (err) {
      message.error('获取出库单详情失败');
    }
  };

  const handleAllocate = async (orderId) => {
    try {
      const response = await outboundAPI.allocate(orderId);
      setAllocateResult(response.data);
      setAllocateModalVisible(true);
      fetchOrders();
    } catch (err) {
      message.error(err.response?.data?.error || '分配失败');
    }
  };

  const handleConfirmPick = async (orderId) => {
    try {
      const response = await outboundAPI.getById(orderId);
      setSelectedOrder(response.data);
      setPickModalVisible(true);
    } catch (err) {
      message.error('获取出库单详情失败');
    }
  };

  const handleConfirmPickSubmit = async () => {
    try {
      await outboundAPI.confirmPick(selectedOrder.id, {});
      message.success('拣货确认成功');
      setPickModalVisible(false);
      fetchOrders();
    } catch (err) {
      message.error(err.response?.data?.error || '拣货确认失败');
    }
  };

  const handleComplete = async (orderId) => {
    try {
      await outboundAPI.complete(orderId);
      message.success('出库单已完成');
      fetchOrders();
    } catch (err) {
      message.error(err.response?.data?.error || '操作失败');
    }
  };

  const columns = [
    {
      title: '出库单号',
      dataIndex: 'order_no',
      width: 160,
      render: (v, r) => (
        <a onClick={() => handleViewOrder(r.id)} style={{ fontWeight: 500 }}>{v}</a>
      )
    },
    {
      title: '商户',
      dataIndex: 'merchant_name',
      width: 140
    },
    {
      title: '仓库',
      dataIndex: 'warehouse_name',
      width: 140
    },
    {
      title: '总数量',
      dataIndex: 'total_quantity',
      width: 100,
      render: (v, r) => `${v} ${r.items?.[0]?.unit || ''}`
    },
    {
      title: '项数',
      dataIndex: 'item_count',
      width: 80
    },
    {
      title: '配送日期',
      dataIndex: 'delivery_date',
      width: 120,
      render: (v) => v ? dayjs(v).format('YYYY-MM-DD') : '-'
    },
    {
      title: '目的地',
      dataIndex: 'destination',
      width: 120,
      ellipsis: true
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (v) => {
        const status = STATUS_MAP[v];
        return <Tag color={status?.color}>{status?.text}</Tag>;
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_, r) => (
        <Space>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleViewOrder(r.id)}>
            详情
          </Button>
          {r.status === 'pending' && (
            <Button type="link" size="small" icon={<RocketOutlined />} onClick={() => handleAllocate(r.id)}>
              分配库存
            </Button>
          )}
          {r.status === 'picking' && (
            <Button type="link" size="small" icon={<CheckOutlined />} onClick={() => handleConfirmPick(r.id)}>
              拣货确认
            </Button>
          )}
          {(r.status === 'picking' || r.status === 'checking') && (
            <Button type="primary" size="small" onClick={() => handleComplete(r.id)}>
              完成
            </Button>
          )}
        </Space>
      )
    }
  ];

  return (
    <div>
      <div className="page-header">
        <Title level={3} style={{ margin: 0, marginBottom: 8 }}>出库管理</Title>
        <Text type="secondary">管理所有出库订单，包括库存分配、拣货确认等操作</Text>
      </div>

      <Card 
        className="card-shadow"
        title="出库单列表"
        extra={
          <Space>
            <Select
              placeholder="状态筛选"
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ width: 140 }}
              allowClear
            >
              <Option value="pending">待分配</Option>
              <Option value="picking">拣货中</Option>
              <Option value="checking">复核中</Option>
              <Option value="completed">已完成</Option>
            </Select>
            <Button icon={<SearchOutlined />} onClick={fetchOrders}>刷新</Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={orders}
          loading={loading}
          rowKey="id"
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条出库单`
          }}
        />
      </Card>

      <Modal
        title="出库单详情"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={null}
        width={900}
      >
        {selectedOrder && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="出库单号">{selectedOrder.order_no}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={STATUS_MAP[selectedOrder.status]?.color}>
                  {STATUS_MAP[selectedOrder.status]?.text}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="商户">{selectedOrder.merchant_name}</Descriptions.Item>
              <Descriptions.Item label="仓库">{selectedOrder.warehouse_name}</Descriptions.Item>
              <Descriptions.Item label="联系人">{selectedOrder.contact_person}</Descriptions.Item>
              <Descriptions.Item label="联系电话">{selectedOrder.contact_phone}</Descriptions.Item>
              <Descriptions.Item label="配送日期">{selectedOrder.delivery_date}</Descriptions.Item>
              <Descriptions.Item label="目的地">{selectedOrder.destination}</Descriptions.Item>
            </Descriptions>

            <Card title="出库明细" size="small" type="inner">
              <List
                dataSource={selectedOrder.items}
                renderItem={(item, idx) => (
                  <List.Item key={item.id}>
                    <List.Item.Meta
                      title={
                        <Space>
                          <Text strong>{idx + 1}. {item.category_name}</Text>
                          <Tag color={STATUS_MAP[item.status]?.color}>{STATUS_MAP[item.status]?.text}</Tag>
                        </Space>
                      }
                      description={
                        <Space direction="vertical" size={0} style={{ width: '100%' }}>
                          <Space>
                            <span>申请数量: {item.requested_quantity} {item.unit}</span>
                            <span>已分配: {item.allocated_quantity || 0} {item.unit}</span>
                          </Space>
                          {item.allocations?.length > 0 && (
                            <div style={{ marginTop: 8 }}>
                              <Text type="secondary">分配明细:</Text>
                              {item.allocations.map((alloc, aIdx) => (
                                <Tag key={aIdx} style={{ marginLeft: 8 }}>
                                  {alloc.batch_no} · {alloc.quantity} {item.unit}
                                  {alloc.expiry_date && ` · 过期: ${alloc.expiry_date}`}
                                  {alloc.batch_status !== 'normal' && (
                                    <Tag color={INVENTORY_STATUS_MAP[alloc.batch_status]?.color}>
                                      {INVENTORY_STATUS_MAP[alloc.batch_status]?.text}
                                    </Tag>
                                  )}
                                </Tag>
                              ))}
                            </div>
                          )}
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            </Card>
          </Space>
        )}
      </Modal>

      <Modal
        title="库存分配结果"
        open={allocateModalVisible}
        onCancel={() => {
          setAllocateModalVisible(false);
          setAllocateResult(null);
        }}
        onOk={() => {
          setAllocateModalVisible(false);
          setAllocateResult(null);
        }}
        okText="确定"
        width={700}
      >
        {allocateResult && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Alert
              message="分配成功"
              description={allocateResult.message}
              type="success"
              showIcon
            />
            
            {allocateResult.warnings?.length > 0 && (
              <Alert
                message="注意事项"
                description={
                  <List
                    dataSource={allocateResult.warnings}
                    renderItem={(warning) => (
                      <List.Item>
                        <WarningOutlined style={{ color: '#faad14', marginRight: 8 }} />
                        {warning}
                      </List.Item>
                    )}
                  />
                }
                type="warning"
                showIcon
              />
            )}

            <Divider />
            
            <div>
              <Text strong>分配详情:</Text>
              {allocateResult.allocations?.map((alloc, idx) => (
                <Card key={idx} size="small" style={{ marginTop: 8 }} title={
                  <Space>
                    <Text>品类 {alloc.categoryId}</Text>
                    <Tag color="blue">共 {alloc.allocations.length} 个批次</Tag>
                  </Space>
                }>
                  {alloc.allocations.map((a, aIdx) => (
                    <Tag key={aIdx} style={{ margin: 4 }}>
                      {a.batchNo} · {a.quantity} · {a.locationCode}
                      {a.status !== 'normal' && (
                        <Tag color={INVENTORY_STATUS_MAP[a.status]?.color}>
                          {INVENTORY_STATUS_MAP[a.status]?.text}
                        </Tag>
                      )}
                    </Tag>
                  ))}
                </Card>
              ))}
            </div>
          </Space>
        )}
      </Modal>

      <Modal
        title="拣货确认"
        open={pickModalVisible}
        onOk={handleConfirmPickSubmit}
        onCancel={() => setPickModalVisible(false)}
        okText="确认拣货完成"
        width={700}
      >
        <Alert
          message="请核对"
          description="请按照分配明细进行拣货，确认所有商品已正确拣出。临期和呆滞库存已优先分配。"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        
        {selectedOrder?.items?.map((item, idx) => (
          <Card key={idx} size="small" style={{ marginTop: 8 }} title={
            <Space>
              <Text strong>{item.category_name}</Text>
              <Tag color="blue">申请 {item.requested_quantity} {item.unit}</Tag>
            </Space>
          }>
            {item.allocations?.map((alloc, aIdx) => (
              <Space key={aIdx} style={{ margin: '4px 0' }}>
                <Tag>{alloc.batch_no}</Tag>
                <span>库位: {alloc.location_code}</span>
                <span>数量: {alloc.quantity} {item.unit}</span>
                {alloc.batch_status !== 'normal' && (
                  <Tag color={INVENTORY_STATUS_MAP[alloc.batch_status]?.color}>
                    {INVENTORY_STATUS_MAP[alloc.batch_status]?.text}
                  </Tag>
                )}
              </Space>
            ))}
          </Card>
        ))}
      </Modal>
    </div>
  );
};

export default AdminOutbound;
