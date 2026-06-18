import { useState } from 'react';
import { Card, Table, Tag, Space, Input, Button, Modal, Form, message, Typography, Descriptions, Row, Col, Statistic } from 'antd';
import { 
  TeamOutlined, 
  SearchOutlined, 
  PlusOutlined,
  EyeOutlined,
  EditOutlined,
  UserOutlined,
  InboxOutlined,
  SendOutlined
} from '@ant-design/icons';
import { userAPI, leaseAPI } from '../../services/apiEndpoints';
import { useRequest } from '../../hooks/useRequest';
import { STATUS_MAP } from '../../utils/constants';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const AdminMerchants = () => {
  const [searchText, setSearchText] = useState('');
  const [selectedMerchant, setSelectedMerchant] = useState(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [form] = Form.useForm();

  const { data: merchants, loading, run: fetchMerchants } = useRequest(
    () => userAPI.getMerchants()
  );

  const handleViewMerchant = async (merchantId) => {
    try {
      const [userRes, leaseRes] = await Promise.all([
        userAPI.getById(merchantId),
        leaseAPI.getAll({ merchantId })
      ]);
      setSelectedMerchant({
        ...userRes.data,
        leases: leaseRes.data
      });
      setDetailModalVisible(true);
    } catch (err) {
      message.error('获取商户详情失败');
    }
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      await userAPI.create({
        ...values,
        role: 'merchant'
      });
      message.success('商户创建成功');
      setCreateModalVisible(false);
      form.resetFields();
      fetchMerchants();
    } catch (err) {
      message.error(err.response?.data?.error || '创建失败');
    }
  };

  const handleToggleStatus = async (merchantId, currentStatus) => {
    try {
      const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
      await userAPI.update(merchantId, { status: newStatus });
      message.success(`商户已${newStatus === 'active' ? '启用' : '禁用'}`);
      fetchMerchants();
    } catch (err) {
      message.error(err.response?.data?.error || '操作失败');
    }
  };

  const filteredMerchants = merchants?.filter(m =>
    m.name?.toLowerCase().includes(searchText.toLowerCase()) ||
    m.company_name?.toLowerCase().includes(searchText.toLowerCase()) ||
    m.phone?.includes(searchText)
  ) || [];

  const columns = [
    {
      title: '商户名称',
      dataIndex: 'name',
      width: 120,
      render: (v, r) => (
        <a onClick={() => handleViewMerchant(r.id)} style={{ fontWeight: 500 }}>
          <Space>
            <UserOutlined />
            {v}
          </Space>
        </a>
      )
    },
    {
      title: '公司名称',
      dataIndex: 'company_name',
      width: 200
    },
    {
      title: '联系电话',
      dataIndex: 'phone',
      width: 140
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      width: 200
    },
    {
      title: '租约数',
      dataIndex: 'lease_count',
      width: 80,
      render: (v) => <Tag color="blue">{v} 份</Tag>
    },
    {
      title: '有效租约',
      dataIndex: 'active_lease_count',
      width: 100,
      render: (v) => <Tag color="success">{v} 份</Tag>
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
      width: 180,
      render: (_, r) => (
        <Space>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleViewMerchant(r.id)}>
            详情
          </Button>
          <Button type="link" size="small" icon={<EditOutlined />}>
            编辑
          </Button>
          <Button 
            type="link" 
            size="small" 
            danger={r.status === 'active'}
            onClick={() => handleToggleStatus(r.id, r.status)}
          >
            {r.status === 'active' ? '禁用' : '启用'}
          </Button>
        </Space>
      )
    }
  ];

  const totalStats = {
    total: merchants?.length || 0,
    active: merchants?.filter(m => m.status === 'active').length || 0,
    inactive: merchants?.filter(m => m.status === 'inactive').length || 0,
    withLease: merchants?.filter(m => m.active_lease_count > 0).length || 0
  };

  return (
    <div>
      <div className="page-header">
        <Title level={3} style={{ margin: 0, marginBottom: 8 }}>商户管理</Title>
        <Text type="secondary">管理所有入驻商户信息</Text>
      </div>

      <Row gutter={[16, 16]}>
        <Col span={6}>
          <Card className="card-shadow">
            <Statistic
              title={<Space><TeamOutlined /> 总商户数</Space>}
              value={totalStats.total}
              suffix="家"
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="card-shadow">
            <Statistic
              title={<Space><UserOutlined /> 活跃商户</Space>}
              value={totalStats.active}
              suffix="家"
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="card-shadow">
            <Statistic
              title={<Space><InboxOutlined /> 有租约商户</Space>}
              value={totalStats.withLease}
              suffix="家"
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="card-shadow">
            <Statistic
              title={<Space><SendOutlined /> 禁用商户</Space>}
              value={totalStats.inactive}
              suffix="家"
              valueStyle={{ color: '#8c8c8c' }}
            />
          </Card>
        </Col>
      </Row>

      <Card 
        className="card-shadow" 
        style={{ marginTop: 16 }}
        title="商户列表"
        extra={
          <Space>
            <Input
              placeholder="搜索商户名称、公司、电话"
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              style={{ width: 280 }}
              allowClear
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalVisible(true)}>
              新增商户
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={filteredMerchants}
          loading={loading}
          rowKey="id"
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 家商户`
          }}
        />
      </Card>

      <Modal
        title="商户详情"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={null}
        width={900}
      >
        {selectedMerchant && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="商户姓名">{selectedMerchant.name}</Descriptions.Item>
              <Descriptions.Item label="用户名">{selectedMerchant.username}</Descriptions.Item>
              <Descriptions.Item label="公司名称">{selectedMerchant.company_name}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={STATUS_MAP[selectedMerchant.status]?.color}>
                  {STATUS_MAP[selectedMerchant.status]?.text}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="联系电话">{selectedMerchant.phone}</Descriptions.Item>
              <Descriptions.Item label="邮箱">{selectedMerchant.email || '-'}</Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {dayjs(selectedMerchant.created_at).format('YYYY-MM-DD HH:mm')}
              </Descriptions.Item>
            </Descriptions>

            {selectedMerchant.leases?.length > 0 && (
              <Card title="租约记录" size="small" type="inner">
                <Table
                  columns={[
                    { title: '租约ID', dataIndex: 'id', width: 80 },
                    { title: '库位', dataIndex: 'location_code', width: 120 },
                    { title: '仓库', dataIndex: 'warehouse_name', width: 120 },
                    { title: '品类', dataIndex: 'category_name', width: 100 },
                    { 
                      title: '当前库存', 
                      dataIndex: 'current_stock', 
                      render: (v) => v ? `${v}` : '0' 
                    },
                    { title: '租期', dataIndex: 'start_date', render: (v, r) => `${v} ~ ${r.end_date || '长期'}` },
                    { 
                      title: '状态', 
                      dataIndex: 'status', 
                      render: (v) => {
                        const status = STATUS_MAP[v];
                        return <Tag color={status?.color}>{status?.text}</Tag>;
                      } 
                    }
                  ]}
                  dataSource={selectedMerchant.leases}
                  rowKey="id"
                  size="small"
                  pagination={false}
                />
              </Card>
            )}
          </Space>
        )}
      </Modal>

      <Modal
        title="新增商户"
        open={createModalVisible}
        onOk={handleCreate}
        onCancel={() => {
          setCreateModalVisible(false);
          form.resetFields();
        }}
        okText="创建"
        width={600}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="username"
                label="登录用户名"
                rules={[{ required: true, message: '请输入用户名' }]}
              >
                <Input placeholder="请输入登录用户名" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="password"
                label="初始密码"
                rules={[{ required: true, message: '请输入初始密码' }]}
              >
                <Input.Password placeholder="请输入初始密码" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="name"
                label="联系人姓名"
                rules={[{ required: true, message: '请输入联系人姓名' }]}
              >
                <Input placeholder="请输入联系人姓名" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="companyName"
                label="公司名称"
                rules={[{ required: true, message: '请输入公司名称' }]}
              >
                <Input placeholder="请输入公司名称" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="phone"
                label="联系电话"
                rules={[{ required: true, message: '请输入联系电话' }]}
              >
                <Input placeholder="请输入联系电话" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="email"
                label="邮箱"
              >
                <Input placeholder="请输入邮箱" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
};

export default AdminMerchants;
