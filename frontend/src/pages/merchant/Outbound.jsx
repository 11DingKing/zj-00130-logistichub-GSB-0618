import { useState } from 'react';
import { Card, Table, Tag, Space, Select, Button, Modal, Form, Input, InputNumber, DatePicker, message, Typography, Descriptions, List, Alert, Row, Col, Divider } from 'antd';
import { 
  SendOutlined, 
  SearchOutlined, 
  EyeOutlined,
  PlusOutlined
} from '@ant-design/icons';
import { outboundAPI, warehouseAPI, inventoryAPI } from '../../services/apiEndpoints';
import { useRequest } from '../../hooks/useRequest';
import { STATUS_MAP } from '../../utils/constants';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

const MerchantOutbound = () => {
  const [statusFilter, setStatusFilter] = useState();
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [items, setItems] = useState([{ id: Date.now() }]);

  const { data: orders, loading, run: fetchOrders } = useRequest(
    () => outboundAPI.getMyOrders()
  );
  const { data: warehouses } = useRequest(
    () => warehouseAPI.getAll({ status: 'active' })
  );
  const { data: inventoryData } = useRequest(
    () => inventoryAPI.getMyInventory()
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

  const handleAddItem = () => {
    setItems([...items, { id: Date.now() }]);
  };

  const handleRemoveItem = (id) => {
    if (items.length > 1) {
      setItems(items.filter(item => item.id !== id));
    }
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      
      const itemsData = items.map((item, idx) => ({
        categoryId: values[`category_${item.id}`],
        requestedQuantity: values[`quantity_${item.id}`],
        unit: values[`unit_${item.id}`] || '件',
        remarks: values[`remarks_${item.id}`]
      }));

      const orderData = {
        warehouseId: values.warehouseId,
        deliveryDate: values.deliveryDate?.format('YYYY-MM-DD'),
        contactPerson: values.contactPerson,
        contactPhone: values.contactPhone,
        destination: values.destination,
        remarks: values.remarks,
        items: itemsData
      };

      await outboundAPI.create(orderData);
      message.success('出库申请提交成功');
      setCreateModalVisible(false);
      form.resetFields();
      setItems([{ id: Date.now() }]);
      fetchOrders();
    } catch (err) {
      message.error(err.response?.data?.error || '提交失败');
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
      title: '仓库',
      dataIndex: 'warehouse_name',
      width: 140
    },
    {
      title: '总数量',
      dataIndex: 'total_quantity',
      width: 100
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
      width: 150,
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
      title: '创建时间',
      dataIndex: 'created_at',
      width: 160,
      render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm')
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_, r) => (
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleViewOrder(r.id)}>
          详情
        </Button>
      )
    }
  ];

  return (
    <div>
      <div className="page-header">
        <Title level={3} style={{ margin: 0, marginBottom: 8 }}>出库申请</Title>
        <Text type="secondary">提交和管理您的出库订单</Text>
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
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalVisible(true)}>
              新建出库
            </Button>
            <Button icon={<SearchOutlined />} onClick={fetchOrders}>刷新</Button>
          </Space>
        }
      >
        <Alert
          message="出库流程"
          description="1. 提交出库申请 → 2. 系统自动按先进先出分配库存 → 3. 仓管拣货 → 4. 出库完成。临期和呆滞库存会被优先分配。"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />

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
        width={800}
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
              <Descriptions.Item label="仓库">{selectedOrder.warehouse_name}</Descriptions.Item>
              <Descriptions.Item label="总数量">{selectedOrder.total_quantity}</Descriptions.Item>
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
                              <Text type="secondary">分配批次:</Text>
                              {item.allocations.map((alloc, aIdx) => (
                                <Tag key={aIdx} style={{ marginLeft: 8 }}>
                                  {alloc.batch_no} · {alloc.quantity} {item.unit}
                                  {alloc.expiry_date && ` · 过期: ${alloc.expiry_date}`}
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
        title="新建出库申请"
        open={createModalVisible}
        onOk={handleCreate}
        onCancel={() => {
          setCreateModalVisible(false);
          form.resetFields();
          setItems([{ id: Date.now() }]);
        }}
        okText="提交申请"
        width={800}
      >
        <Alert
          message="库存分配规则"
          description="系统将自动按照先进先出原则分配库存。临期（30天内）和呆滞（90天未动）的库存会被优先分配出库。"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="warehouseId"
                label="出库仓库"
                rules={[{ required: true, message: '请选择出库仓库' }]}
              >
                <Select placeholder="请选择仓库">
                  {warehouses?.map(wh => (
                    <Option key={wh.id} value={wh.id}>{wh.name}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="deliveryDate"
                label="期望配送日期"
                rules={[{ required: true, message: '请选择配送日期' }]}
              >
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="contactPerson"
                label="收件人"
                rules={[{ required: true, message: '请输入收件人' }]}
              >
                <Input placeholder="请输入收件人姓名" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="contactPhone"
                label="联系电话"
                rules={[{ required: true, message: '请输入联系电话' }]}
              >
                <Input placeholder="请输入联系电话" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="destination"
            label="目的地地址"
            rules={[{ required: true, message: '请输入目的地地址' }]}
          >
            <Input placeholder="请输入详细地址" />
          </Form.Item>

          {inventoryData?.summary?.length > 0 && (
            <Card size="small" title="当前可用库存" style={{ marginBottom: 16 }}>
              <Space wrap>
                {inventoryData.summary.map(item => (
                  <Tag key={item.category_id} color="blue">
                    {item.category_name}: {item.total_quantity} {item.category_unit}
                  </Tag>
                ))}
              </Space>
            </Card>
          )}

          <Divider orientation="left">出库商品明细</Divider>

          {items.map((item, idx) => (
            <Card key={item.id} size="small" title={
              <Space>
                <Text strong>商品 {idx + 1}</Text>
                {items.length > 1 && (
                  <Button type="link" size="small" danger onClick={() => handleRemoveItem(item.id)}>
                    删除
                  </Button>
                )}
              </Space>
            } style={{ marginBottom: 12 }}>
              <Row gutter={16}>
                <Col span={10}>
                  <Form.Item
                    name={`category_${item.id}`}
                    label="货物品类"
                    rules={[{ required: true, message: '请选择品类' }]}
                    style={{ marginBottom: 8 }}
                  >
                    <Select placeholder="请选择品类">
                      {inventoryData?.summary?.map(cat => (
                        <Option key={cat.category_id} value={cat.category_id}>
                          {cat.category_name} (库存: {cat.total_quantity} {cat.category_unit})
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item
                    name={`quantity_${item.id}`}
                    label="出库数量"
                    rules={[{ required: true, message: '请输入数量' }]}
                    style={{ marginBottom: 8 }}
                  >
                    <InputNumber min={1} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={4}>
                  <Form.Item
                    name={`unit_${item.id}`}
                    label="单位"
                    initialValue="件"
                    style={{ marginBottom: 8 }}
                  >
                    <Input placeholder="单位" />
                  </Form.Item>
                </Col>
                <Col span={4}>
                  <Form.Item
                    name={`remarks_${item.id}`}
                    label="备注"
                    style={{ marginBottom: 8 }}
                  >
                    <Input placeholder="备注" />
                  </Form.Item>
                </Col>
              </Row>
            </Card>
          ))}

          <Button type="dashed" block icon={<PlusOutlined />} onClick={handleAddItem}>
            添加商品
          </Button>

          <Form.Item name="remarks" label="其他备注" style={{ marginTop: 16 }}>
            <Input.TextArea rows={2} placeholder="其他说明" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default MerchantOutbound;
